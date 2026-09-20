import SwiftUI
import Network

// MARK: - Theme

enum FarmanTheme {
    static let background = Color(hex: 0x21100C)
    static let deepBrown = Color(hex: 0x2B1712)
    static let surface = Color(hex: 0x382119)
    static let raised = Color(hex: 0x472A20)
    static let border = Color(hex: 0x765044)
    static let text = Color(hex: 0xFFF7EF)
    static let secondary = Color(hex: 0xCBB8AA)
    static let olive = Color(hex: 0x9ABD55)
    static let oliveDark = Color(hex: 0x61752E)
    static let wine = Color(hex: 0xC4516D)
    static let warning = Color(hex: 0xD3A55C)
}

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255,
                  opacity: alpha)
    }
}

// MARK: - Models

struct SessionUser: Codable {
    let name: String?
    let email: String?
    let role: String?
}

struct SessionEnvelope: Codable { let user: SessionUser? }

struct FarmanOrder: Codable, Identifiable {
    let id: String
    var status: String
    var statusLabel: String
    let orderType: String
    let total: Int
    let createdAt: String
    let customerName: String
    let itemCount: Int
    let tableLabel: String?
    let allowedNext: [String]
}

struct OrdersEnvelope: Codable { let orders: [FarmanOrder] }

struct DashboardSnapshot: Codable {
    var todayRevenue: Double = 0
    var monthRevenue: Double = 0
    var todayOrders: Int = 0
    var activeOrders: Int = 0
    var lowStock: Int = 0
    var topProducts: [ProductMetric] = []
    var daily: [DailyMetric] = []
}

struct ProductMetric: Codable, Identifiable {
    var id: String { name }
    let name: String
    let quantity: Int
    let revenue: Double
}

struct DailyMetric: Codable, Identifiable {
    var id: String { date }
    let date: String
    let revenue: Double
    let orders: Int
}

struct ManagementRecord: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let value: String?
    let status: String?
    let action: String?
    let enabled: Bool?
}

struct MobileOverview: Codable {
    let modules: [String: [ManagementRecord]]
    let updatedAt: String
}

struct CachedState: Codable {
    let user: SessionUser?
    let dashboard: DashboardSnapshot
    let orders: [FarmanOrder]
    let management: [String: [ManagementRecord]]?
    let lastSync: Date?
}

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - Networking and local cache

final class FarmanStore: ObservableObject {
    /// Addresses probed in order when the saved address does not answer.
    /// The Mac's address changes per network (iPhone hotspot 172.20.10.x, café
    /// LAN, …), so the app finds the server itself instead of trusting a stale IP.
    static let serverCandidates: [String] = [
        "http://172.20.10.5:3080",
        "http://172.20.10.1:3080",
        "http://10.16.255.159:3080",
        "http://Armans-MacBook-Pro.local:3080"
    ]

    static var server: URL {
        if let saved = UserDefaults.standard.string(forKey: "farman-server-url"),
           let url = URL(string: saved), url.host != nil {
            return url
        }
        return URL(string: serverCandidates[0])!
    }

    static func saveServer(_ raw: String) {
        var fixed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !fixed.hasPrefix("http") { fixed = "http://\(fixed)" }
        fixed = fixed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if URL(string: fixed)?.host != nil {
            UserDefaults.standard.set(fixed, forKey: "farman-server-url")
        }
    }

    static func label(for url: URL) -> String {
        url.host.map { "\(url.scheme ?? "http")://\($0):\(url.port ?? 3080)" } ?? url.absoluteString
    }

    @Published var serverLabel: String = FarmanStore.label(for: FarmanStore.server)

    @Published var user: SessionUser?
    @Published var dashboard = DashboardSnapshot()
    @Published var orders: [FarmanOrder] = []
    @Published var management: [String: [ManagementRecord]] = [:]
    @Published var isOnline = false
    @Published var isBusy = false
    @Published var lastSync: Date?
    @Published var errorMessage: String?

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "app.farman.network")
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: config)
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-FarmanPreview") {
            seedPreviewData()
            isOnline = true
            return
        }
#endif
        loadCache()
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                let hadNetwork = self?.isOnline ?? false
                self?.isOnline = path.status == .satisfied
                // Network came back: verify the Farman server itself is reachable
                // (LTE on ≠ server reachable — the Mac IP changes per network).
                if path.status == .satisfied && !hadNetwork {
                    Task { await self?.pingServerThenBootstrap() }
                }
            }
        }
        monitor.start(queue: monitorQueue)
        Task { await pingServerThenBootstrap() }
    }

    @MainActor
    func pingServerThenBootstrap() async {
        let reachable = await resolveServer()
        // If we never logged in, keep isOnline true so login can be attempted;
        // otherwise reflect real server reachability to stop misleading "online".
        if user != nil || hasOfflineContent {
            isOnline = reachable
        } else if reachable {
            isOnline = true
        }
        if reachable { await bootstrap() }
    }

    /// True if the Farman server answers at all (even 401 = reachable, just logged out).
    func isServerReachable() async -> Bool {
        await isReachable(Self.server)
    }

    func isReachable(_ url: URL) async -> Bool {
        var request = URLRequest(url: url.appendingPathComponent("api/auth/session"))
        request.httpMethod = "GET"
        request.timeoutInterval = 4
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse) != nil
        } catch {
            return false
        }
    }

    /// Keeps the saved address when it answers, otherwise probes the known
    /// candidates (hotspot / café LAN / Mac mDNS name) and remembers the first
    /// one that responds. Returns whether any address is reachable.
    @MainActor
    func resolveServer() async -> Bool {
        var resolved: URL?
        if await isReachable(Self.server) {
            resolved = Self.server
        } else {
            for candidate in Self.serverCandidates where candidate != Self.server.absoluteString {
                guard let url = URL(string: candidate) else { continue }
                if await isReachable(url) {
                    Self.saveServer(candidate)
                    resolved = url
                    break
                }
            }
        }
        serverLabel = Self.label(for: resolved ?? Self.server)
        guard resolved != nil else { return false }
        discardStaleSessionIfNeeded()
        return true
    }

    var hasOfflineContent: Bool { user != nil || !orders.isEmpty || lastSync != nil }

    @MainActor
    func bootstrap() async {
        do {
            if let remoteUser = try await fetchSession() {
                user = remoteUser
                UserDefaults.standard.set(Self.server.host, forKey: Self.sessionHostKey)
                try await refreshAll()
            } else {
                // The server reports no session for this address, so a cached
                // user would be stale data from an old host/session.
                if user != nil { clearSession() }
                isOnline = true
            }
        } catch let api as APIError {
            // 401/403 = server reachable but session invalid → stay online for login.
            if api.message.contains("دسترسی") || api.message.contains("نامعتبر") {
                isOnline = true
            } else {
                isOnline = false
                errorMessage = "سرور در دسترس نیست (\(serverLabel))؛ اطلاعات ذخیره‌شده نمایش داده می‌شود."
            }
        } catch {
            isOnline = false
            errorMessage = "سرور در دسترس نیست (\(serverLabel))؛ اطلاعات ذخیره‌شده نمایش داده می‌شود."
        }
    }

    @MainActor
    func login(email: String, password: String) async -> Bool {
        if !(await isServerReachable()) {
            errorMessage = "سرور \(serverLabel) در دسترس نیست؛ به همان وای‌فای/هات‌اسپات مک وصل شوید."
            isOnline = false
            return false
        }
        isOnline = true
        isBusy = true
        defer { isBusy = false }
        do {
            let csrfData = try await request(path: "/api/auth/csrf")
            guard let json = try JSONSerialization.jsonObject(with: csrfData) as? [String: Any],
                  let csrf = json["csrfToken"] as? String else {
                throw APIError(message: "توکن ورود دریافت نشد.")
            }
            var request = URLRequest(url: Self.server.appendingPathComponent("api/auth/callback/credentials"))
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let fields = [
                "csrfToken": csrf,
                "email": email,
                "password": password,
                "callbackUrl": Self.server.absoluteString,
                "json": "true"
            ]
            request.httpBody = fields.map { key, value in
                "\(key.urlEncoded)=\(value.urlEncoded)"
            }.joined(separator: "&").data(using: .utf8)
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<400).contains(http.statusCode) else {
                throw APIError(message: "ایمیل یا رمز عبور صحیح نیست.")
            }
            guard let signedIn = try await fetchSession() else {
                throw APIError(message: "ایمیل یا رمز عبور صحیح نیست.")
            }
            user = signedIn
            UserDefaults.standard.set(Self.server.host, forKey: Self.sessionHostKey)
            try await refreshAll()
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "ورود انجام نشد."
            return false
        }
    }

    @MainActor
    func refreshAll() async throws {
        isBusy = true
        defer { isBusy = false }
        do {
            async let ordersData = request(path: "/api/admin/orders")
            let rawOrders = try await ordersData
            orders = try JSONDecoder().decode(OrdersEnvelope.self, from: rawOrders).orders
        } catch {
            isOnline = false
            throw APIError(message: "به‌روزرسانی انجام نشد؛ سرور \(serverLabel) در دسترس نیست. نسخه ذخیره‌شده باقی ماند.")
        }
        if let rawAnalytics = try? await request(path: "/api/admin/analytics") {
            if let parsed = try? parseDashboard(rawAnalytics) { dashboard = parsed }
        }
        if let overviewData = try? await request(path: "/api/admin/mobile/overview") {
            if let decoded = try? JSONDecoder().decode(MobileOverview.self, from: overviewData) {
                management = decoded.modules
            }
        }
        isOnline = true
        lastSync = Date()
        saveCache()
        errorMessage = nil
    }

    @MainActor
    func refreshQuietly() async {
        do { try await refreshAll() }
        catch let api as APIError { errorMessage = api.message }
        catch { errorMessage = "به‌روزرسانی انجام نشد؛ نسخه ذخیره‌شده باقی ماند." }
    }

    @MainActor
    func createReservation(tableId: String, customerName: String, phone: String, guests: Int, date: Date, durationMin: Int) async -> Bool {
        guard await isServerReachable() else {
            errorMessage = "سرور \(serverLabel) در دسترس نیست؛ رزرو ثبت نشد."
            isOnline = false
            return false
        }
        isBusy = true
        defer { isBusy = false }
        do {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime]
            let payload: [String: Any] = [
                "tableId": tableId,
                "customerName": customerName,
                "customerPhone": phone,
                "guests": guests,
                "reservedAt": formatter.string(from: date),
                "durationMin": durationMin
            ]
            let body = try JSONSerialization.data(withJSONObject: payload)
            _ = try await request(path: "/api/admin/reservations", method: "POST", body: body)
            if let overviewData = try? await request(path: "/api/admin/mobile/overview") {
                if let decoded = try? JSONDecoder().decode(MobileOverview.self, from: overviewData) {
                    management = decoded.modules
                }
            }
            lastSync = Date()
            saveCache()
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "ثبت رزرو انجام نشد."
            return false
        }
    }

    @MainActor
    func update(order: FarmanOrder, to status: String) async {
        guard isOnline else {
            errorMessage = "تغییر وضعیت فقط هنگام اتصال به سرور ممکن است."
            return
        }
        isBusy = true
        defer { isBusy = false }
        do {
            let body = try JSONSerialization.data(withJSONObject: ["status": status])
            _ = try await request(path: "/api/admin/orders/\(order.id)/status", method: "PUT", body: body)
            try await refreshAll()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "تغییر وضعیت انجام نشد."
        }
    }

    @MainActor
    func askAssistant(_ question: String) async throws -> String {
        guard isOnline else { throw APIError(message: "دستیار برای پاسخ‌گویی به اتصال سرور نیاز دارد.") }
        let body = try JSONSerialization.data(withJSONObject: ["question": question, "topic": "general"])
        let data = try await request(path: "/api/admin/ai/chat", method: "POST", body: body)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let answer = object?["answer"] as? String else { throw APIError(message: "پاسخی دریافت نشد.") }
        return answer
    }

    @MainActor
    func perform(record: ManagementRecord, enabled: Bool? = nil, amount: Double? = nil, status: String? = nil) async {
        guard isOnline, let action = record.action else {
            errorMessage = "این تغییر فقط هنگام اتصال به سرور قابل انجام است."
            return
        }
        isBusy = true
        defer { isBusy = false }
        do {
            var payload: [String: Any] = ["action": action, "id": record.id]
            if let enabled { payload["enabled"] = enabled }
            if let amount { payload["amount"] = amount }
            if let status { payload["status"] = status }
            let body = try JSONSerialization.data(withJSONObject: payload)
            _ = try await request(path: "/api/admin/mobile/overview", method: "POST", body: body)
            if let overviewData = try? await request(path: "/api/admin/mobile/overview") {
                management = try JSONDecoder().decode(MobileOverview.self, from: overviewData).modules
            }
            lastSync = Date()
            saveCache()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "تغییر ذخیره نشد."
        }
    }

    /// The host whose session cookie is currently stored. NextAuth cookies are
    /// host-bound, so a new address (LAN IP / hotspot change) means the cached
    /// session is dead and the user has to sign in again.
    private static let sessionHostKey = "farman-session-host"

    @MainActor
    func discardStaleSessionIfNeeded() {
        let authedHost = UserDefaults.standard.string(forKey: Self.sessionHostKey)
        guard user != nil, authedHost != Self.server.host else { return }
        clearSession()
        errorMessage = "آدرس سرور تغییر کرد (\(serverLabel))؛ لطفاً یک‌بار وارد حساب شوید."
    }

    @MainActor
    func clearSession() {
        HTTPCookieStorage.shared.cookies?.forEach(HTTPCookieStorage.shared.deleteCookie)
        UserDefaults.standard.removeObject(forKey: Self.sessionHostKey)
        user = nil
        dashboard = DashboardSnapshot()
        orders = []
        management = [:]
        lastSync = nil
        try? FileManager.default.removeItem(at: cacheURL)
    }

    @MainActor
    func logout() {
        clearSession()
    }

    private func fetchSession() async throws -> SessionUser? {
        let data = try await request(path: "/api/auth/session")
        return try JSONDecoder().decode(SessionEnvelope.self, from: data).user
    }

    private func request(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        var request = URLRequest(url: Self.server.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = method
        request.timeoutInterval = 15
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "پاسخ سرور نامعتبر است.") }
        if http.statusCode == 401 || http.statusCode == 403 { throw APIError(message: "دسترسی این بخش برای حساب شما فعال نیست.") }
        guard (200..<300).contains(http.statusCode) else {
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw APIError(message: object?["error"] as? String ?? "خطای سرور (\(http.statusCode))")
        }
        return data
    }

    private func parseDashboard(_ data: Data) throws -> DashboardSnapshot {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let summary = root["summary"] as? [String: Any] else { throw APIError(message: "داده داشبورد نامعتبر است.") }
        let revenue = summary["revenue"] as? [String: Any] ?? [:]
        let counts = summary["orders"] as? [String: Any] ?? [:]
        let products: [ProductMetric] = (root["topProducts"] as? [[String: Any]] ?? []).compactMap {
            guard let name = $0["name"] as? String else { return nil }
            return ProductMetric(name: name, quantity: $0["quantity"] as? Int ?? 0, revenue: ($0["revenue"] as? NSNumber)?.doubleValue ?? 0)
        }
        let daily: [DailyMetric] = (root["daily"] as? [[String: Any]] ?? []).compactMap {
            guard let date = $0["date"] as? String else { return nil }
            return DailyMetric(date: date, revenue: ($0["revenue"] as? NSNumber)?.doubleValue ?? 0, orders: $0["orders"] as? Int ?? 0)
        }
        return DashboardSnapshot(
            todayRevenue: (revenue["today"] as? NSNumber)?.doubleValue ?? 0,
            monthRevenue: (revenue["month"] as? NSNumber)?.doubleValue ?? 0,
            todayOrders: counts["today"] as? Int ?? 0,
            activeOrders: counts["active"] as? Int ?? 0,
            lowStock: (root["lowStock"] as? [Any])?.count ?? 0,
            topProducts: products,
            daily: daily
        )
    }

    private var cacheURL: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("farman-native-cache.json")
    }

    private func loadCache() {
        guard let data = try? Data(contentsOf: cacheURL),
              let cached = try? JSONDecoder().decode(CachedState.self, from: data) else { return }
        user = cached.user
        dashboard = cached.dashboard
        orders = cached.orders
        management = cached.management ?? [:]
        lastSync = cached.lastSync
    }

    private func saveCache() {
        let state = CachedState(user: user, dashboard: dashboard, orders: orders, management: management, lastSync: lastSync)
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: cacheURL, options: .atomic)
    }

#if DEBUG
    private func seedPreviewData() {
        user = SessionUser(name: "آرمان", email: "owner@farman.local", role: "OWNER")
        dashboard = DashboardSnapshot(
            todayRevenue: 12_480_000, monthRevenue: 184_839_000, todayOrders: 28, activeOrders: 10, lowStock: 3,
            topProducts: [ProductMetric(name: "کاپوچینو", quantity: 18, revenue: 3_240_000)],
            daily: [3, 2.6, 4.2, 5.4, 4.0, 4.1, 5.6, 6.8, 9.1, 7.6, 5.3, 6.1, 7.2, 9.8].enumerated().map { DailyMetric(date: "روز \($0.offset + 1)", revenue: $0.element * 1_000_000, orders: Int($0.element * 2)) }
        )
        orders = [
            FarmanOrder(id: "ORD1025", status: "PENDING", statusLabel: "در انتظار", orderType: "TABLE", total: 285_000, createdAt: "", customerName: "آقای محمدی", itemCount: 2, tableLabel: "میز ۳", allowedNext: ["CONFIRMED"]),
            FarmanOrder(id: "ORD1026", status: "PREPARING", statusLabel: "آماده‌سازی", orderType: "TAKEAWAY", total: 420_000, createdAt: "", customerName: "خانم احمدی", itemCount: 3, tableLabel: nil, allowedNext: ["READY"]),
            FarmanOrder(id: "ORD1027", status: "READY", statusLabel: "آماده", orderType: "TABLE", total: 198_000, createdAt: "", customerName: "مهمان", itemCount: 1, tableLabel: "میز ۲", allowedNext: ["COMPLETED"])
        ]
        let ingredient = ManagementRecord(id: "coffee", title: "دانه قهوه عربیکا", subtitle: "تأمین‌کننده اصلی", value: "۱ کیلوگرم", status: "رو به اتمام", action: "ingredientAdjust", enabled: false)
        management = [
            "ingredients": [ingredient, ManagementRecord(id: "milk", title: "شیر کم‌چرب", subtitle: "موجودی سردخانه", value: "۲ لیتر", status: "رو به اتمام", action: "ingredientAdjust", enabled: false)],
            "tables": (1...12).map { ManagementRecord(id: "t\($0)", title: "میز \($0)", subtitle: "سالن اصلی", value: nil, status: $0 < 9 ? "اشغال" : "آزاد", action: "tableOccupied", enabled: $0 < 9) },
            "reservations": [ManagementRecord(id: "r1", title: "آقای محمدی", subtitle: "میز ۲ • ۲ نفر", value: "11:00", status: "RESERVED", action: "reservationStatus", enabled: true)],
            "leaves": [ManagementRecord(id: "l1", title: "سارا رضایی", subtitle: "قبلی • ۲۷ شهریور تا ۲۸ شهریور", value: "سفر خانوادگی", status: "PENDING", action: "leaveStatus", enabled: true)],
            "products": [ManagementRecord(id: "p1", title: "کاپوچینو", subtitle: "نوشیدنی گرم", value: "۱۸۵٬۰۰۰ تومان", status: "فعال", action: "productAvailability", enabled: true)]
        ]
        lastSync = Date()
    }
#endif
}

extension String {
    var urlEncoded: String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=?")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}

// MARK: - Root and login

struct FarmanRootView: View {
    @StateObject private var store = FarmanStore()

    var body: some View {
        Group {
            if store.user == nil && !store.hasOfflineContent {
                LoginView()
            } else {
                MainShellView()
            }
        }
        .environmentObject(store)
        .environment(\.layoutDirection, .rightToLeft)
        .preferredColorScheme(.dark)
        .task { await store.bootstrap() }
        .alert("فرمان", isPresented: Binding(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) { Button("باشه", role: .cancel) {} } message: { Text(store.errorMessage ?? "") }
    }
}

struct LoginView: View {
    @EnvironmentObject var store: FarmanStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            FarmanTheme.background.ignoresSafeArea()
            Circle().fill(FarmanTheme.olive.opacity(0.08)).frame(width: 360, height: 360).offset(x: -150, y: -280)
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: "cup.and.saucer.fill")
                    .font(.system(size: 52)).foregroundColor(FarmanTheme.olive)
                    .padding(22).background(FarmanTheme.raised).clipShape(Circle())
                VStack(spacing: 7) {
                    Text("فرمان").font(.system(size: 36, weight: .black, design: .rounded))
                    Text("مدیریت کافه، حتی وقتی اینترنت نیست").foregroundColor(FarmanTheme.secondary)
                }
                VStack(spacing: 14) {
                    NativeField(title: "ایمیل", icon: "envelope", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    NativeField(title: "رمز عبور", icon: "lock", text: $password, secure: true)
                    Button {
                        Task { _ = await store.login(email: email, password: password) }
                    } label: {
                        HStack {
                            if store.isBusy { ProgressView().tint(FarmanTheme.background) }
                            Text("ورود به پنل").fontWeight(.bold)
                        }.frame(maxWidth: .infinity).padding(16)
                    }
                    .buttonStyle(.plain).foregroundColor(FarmanTheme.background)
                    .background(FarmanTheme.olive).clipShape(RoundedRectangle(cornerRadius: 16))
                    .disabled(store.isBusy || email.isEmpty || password.isEmpty)
                }
                .padding(20).background(FarmanTheme.surface)
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(FarmanTheme.border))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                HStack(spacing: 7) {
                    Circle().fill(store.isOnline ? FarmanTheme.olive : FarmanTheme.wine).frame(width: 8, height: 8)
                    Text(store.isOnline ? "سرور آماده است" : "ورود نیازمند اتصال به سرور است")
                }.font(.caption).foregroundColor(FarmanTheme.secondary)
                Spacer()
            }.padding(24).foregroundColor(FarmanTheme.text)
        }
    }
}

struct NativeField: View {
    let title: String
    let icon: String
    @Binding var text: String
    var secure = false

    var body: some View {
        HStack {
            Image(systemName: icon).foregroundColor(FarmanTheme.olive)
            if secure { SecureField(title, text: $text) } else { TextField(title, text: $text) }
        }
        .padding(14).background(FarmanTheme.raised)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(FarmanTheme.border))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Main navigation

struct MainShellView: View {
    @EnvironmentObject var store: FarmanStore
    @State private var selected = 0

    init() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(red: 0.13, green: 0.06, blue: 0.045, alpha: 0.98)
        appearance.shadowColor = UIColor(red: 0.42, green: 0.27, blue: 0.22, alpha: 0.8)
        UITabBar.appearance().standardAppearance = appearance
        if #available(iOS 15.0, *) { UITabBar.appearance().scrollEdgeAppearance = appearance }
    }

    var body: some View {
        ZStack(alignment: .top) {
            TabView(selection: $selected) {
                NavigationView { DashboardView() }.tabItem { Label("خانه", systemImage: "square.grid.2x2.fill") }.tag(0)
                NavigationView { OperationsView() }.tabItem { Label("عملیات", systemImage: "bolt.fill") }.tag(1)
                NavigationView { ManagementView() }.tabItem { Label("مدیریت", systemImage: "slider.horizontal.3") }.tag(2)
                NavigationView { AssistantView() }.tabItem { Label("دستیار", systemImage: "sparkles") }.tag(3)
                NavigationView { MoreView() }.tabItem { Label("بیشتر", systemImage: "ellipsis") }.tag(4)
            }
            .accentColor(FarmanTheme.olive)
            if !store.isOnline {
                OfflineBanner().padding(.horizontal, 12).padding(.top, 2)
            }
        }
        .background(FarmanTheme.background.ignoresSafeArea())
    }
}

struct OfflineBanner: View {
    @EnvironmentObject var store: FarmanStore
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
            Text("آفلاین — نسخه ذخیره‌شده")
            Spacer()
            if let date = store.lastSync { Text(date, style: .relative).font(.caption2) }
        }
        .font(.caption.bold()).padding(.horizontal, 12).padding(.vertical, 9)
        .foregroundColor(FarmanTheme.text).background(FarmanTheme.wine.opacity(0.94))
        .clipShape(Capsule())
    }
}

struct ScreenBackground<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ZStack {
            FarmanTheme.background.ignoresSafeArea()
            RadialGradient(colors: [Color(hex: 0x683622, alpha: 0.34), .clear], center: .topTrailing, startRadius: 10, endRadius: 430).ignoresSafeArea()
            LinearGradient(colors: [.clear, Color.black.opacity(0.16)], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
            content
        }
            .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Dashboard

struct DashboardView: View {
    @EnvironmentObject var store: FarmanStore

    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    CafeGreetingHeader()
                    PendingLeaveRequestsCard()
                    LiveServiceStrip(orders: store.orders)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        MetricCard(title: "فروش امروز", value: money(store.dashboard.todayRevenue), detail: "↑ ۱۸٪ نسبت به دیروز", icon: "wallet.pass.fill", tint: FarmanTheme.olive)
                        MetricCard(title: "سفارش‌های امروز", value: faNumber(store.dashboard.todayOrders), detail: "↑ ۱۲٪ نسبت به دیروز", icon: "person.2.fill", tint: FarmanTheme.wine)
                        MetricCard(title: "مواد رو به اتمام", value: faNumber(store.dashboard.lowStock), detail: "آیتم نیازمند خرید", icon: "shippingbox.fill", tint: FarmanTheme.wine)
                        MetricCard(title: "میانگین سبد", value: averageBasket, detail: "↑ ۸٪ نسبت به دیروز", icon: "cart.fill", tint: FarmanTheme.olive)
                    }
                    RevenueChart(points: store.dashboard.daily)
                    ActionRequiredCard(items: store.management["ingredients"] ?? [])
                    NavigationLink(destination: OrdersView()) {
                        Label("سفارش دستی", systemImage: "plus")
                            .font(.headline).frame(maxWidth: .infinity).padding(17)
                            .background(LinearGradient(colors: [FarmanTheme.wine, Color(hex: 0x9F3F58)], startPoint: .leading, endPoint: .trailing))
                            .foregroundColor(.white).clipShape(RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain)
                    SyncFooter()
                }.padding(16).padding(.top, store.isOnline ? 0 : 34)
            }.refreshable { await store.refreshQuietly() }
        }.navigationBarHidden(true)
    }

    private var averageBasket: String {
        guard store.dashboard.todayOrders > 0 else { return "۰ تومان" }
        return money(store.dashboard.todayRevenue / Double(store.dashboard.todayOrders))
    }
}

struct CafeGreetingHeader: View {
    @EnvironmentObject private var store: FarmanStore
    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("سلام \(store.user?.name ?? "آرمان")")
                    .font(.system(size: 27, weight: .black, design: .rounded))
                HStack(spacing: 8) {
                    Text("کافه فرمان").font(.headline)
                    Label(store.isOnline ? "آنلاین" : "آفلاین", systemImage: store.isOnline ? "circle.fill" : "wifi.slash")
                        .font(.caption.bold()).foregroundColor(store.isOnline ? FarmanTheme.olive : FarmanTheme.wine)
                }
                Text("روز خوبی برای یک قهوه عالی است!").font(.caption).foregroundColor(FarmanTheme.secondary)
            }
            Spacer()
            ZStack {
                Circle().fill(LinearGradient(colors: [Color(hex: 0xB78458), FarmanTheme.deepBrown], startPoint: .top, endPoint: .bottom))
                Image(systemName: "cup.and.saucer.fill").font(.title).foregroundColor(.white)
            }.frame(width: 66, height: 66).overlay(Circle().stroke(FarmanTheme.border, lineWidth: 2))
        }.foregroundColor(FarmanTheme.text)
    }
}

struct PendingLeaveRequestsCard: View {
    @EnvironmentObject private var store: FarmanStore
    private var pending: [ManagementRecord] {
        (store.management["leaves"] ?? []).filter { $0.status == "PENDING" }
    }

    var body: some View {
        if !pending.isEmpty {
            NavigationLink(destination: ManagementModuleDetail(module: ManagementModule(
                key: "leaves",
                title: "مرخصی‌ها",
                subtitle: "درخواست‌ها و تأیید مرخصی پرسنل",
                icon: "beach.umbrella.fill",
                color: FarmanTheme.warning
            ))) {
                HStack(spacing: 12) {
                    Image(systemName: "bell.badge.fill")
                        .font(.title2).foregroundColor(FarmanTheme.warning)
                        .frame(width: 48, height: 48)
                        .background(FarmanTheme.warning.opacity(0.14))
                        .clipShape(RoundedRectangle(cornerRadius: 13))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(faNumber(pending.count)) درخواست مرخصی جدید")
                            .font(.headline)
                        Text("برای تأیید یا رد درخواست‌ها لمس کنید")
                            .font(.caption).foregroundColor(FarmanTheme.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.left")
                }
                .padding(14)
                .background(FarmanTheme.warning.opacity(0.10))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(FarmanTheme.warning.opacity(0.60)))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .foregroundColor(FarmanTheme.text)
            }.buttonStyle(.plain)
        }
    }
}

struct HeaderView: View {
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 30, weight: .black, design: .rounded))
            Text(subtitle).font(.subheadline).foregroundColor(FarmanTheme.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).foregroundColor(FarmanTheme.text)
    }
}

struct LiveServiceStrip: View {
    let orders: [FarmanOrder]
    private let states = [("PENDING", "در انتظار", "clock.fill", FarmanTheme.wine), ("CONFIRMED", "تأیید شده", "checkmark.circle.fill", FarmanTheme.olive), ("PREPARING", "آماده‌سازی", "frying.pan.fill", FarmanTheme.wine), ("READY", "آماده تحویل", "takeoutbag.and.cup.and.straw.fill", FarmanTheme.olive)]
    var body: some View {
        VStack(spacing: 14) {
            HStack { Label("ریل سرویس زنده", systemImage: "dot.radiowaves.left.and.right").font(.headline); Spacer(); Text("مشاهده همه ‹").font(.caption).foregroundColor(FarmanTheme.secondary) }
            HStack(spacing: 7) {
                ForEach(states, id: \.0) { state in
                    VStack(spacing: 7) {
                        Image(systemName: state.2).foregroundColor(state.3).font(.title3)
                        Text(state.1).font(.caption2).lineLimit(1).minimumScaleFactor(0.7)
                        Text(faNumber(orders.filter { $0.status == state.0 }.count)).font(.title3.bold())
                    }.frame(maxWidth: .infinity).padding(.vertical, 12).background(state.3.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 13))
                }
            }
        }.padding(15).cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let icon: String
    let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.caption).foregroundColor(FarmanTheme.secondary)
                    Text(value).font(.title3.bold()).lineLimit(1).minimumScaleFactor(0.62)
                }
                Spacer(minLength: 5)
                Image(systemName: icon).font(.headline).foregroundColor(tint).frame(width: 42, height: 42).background(tint.opacity(0.14)).clipShape(Circle())
            }
            Text(detail).font(.caption2).foregroundColor(detail.contains("↑") ? FarmanTheme.olive : FarmanTheme.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16).cardStyle()
    }
}

struct RevenueChart: View {
    let points: [DailyMetric]
    var maxValue: Double { max(points.map(\.revenue).max() ?? 1, 1) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Label("روند فروش", systemImage: "chart.bar.fill").font(.headline); Spacer(); Text("۱۴ روز گذشته⌄").font(.caption).padding(8).background(FarmanTheme.raised).clipShape(RoundedRectangle(cornerRadius: 9)) }
            if points.isEmpty { EmptyInline(text: "داده نمودار هنوز ذخیره نشده است") }
            else { SalesLineGraph(points: points).frame(height: 160) }
        }.padding(16).cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct SalesLineGraph: View {
    let points: [DailyMetric]
    var body: some View {
        GeometryReader { proxy in
            let maxValue = max(points.map(\.revenue).max() ?? 1, 1)
            let count = max(points.count, 2)
            // Inset dots so first/last stay fully visible; line and dots share coords.
            let inset: CGFloat = 8
            let width = max(proxy.size.width - inset * 2, 1)
            let height = max(proxy.size.height - 16, 1)
            let coords: [CGPoint] = points.indices.map { i in
                let x = inset + CGFloat(i) * width / CGFloat(count - 1)
                let y = proxy.size.height - 8 - CGFloat(points[i].revenue / maxValue) * height
                return CGPoint(x: x, y: y)
            }
            ZStack {
                VStack { ForEach(0..<4, id: \.self) { _ in Divider().background(FarmanTheme.border.opacity(0.55)); Spacer() } }
                Canvas { ctx, _ in
                    guard coords.count > 1 else { return }
                    var path = Path()
                    path.move(to: coords[0])
                    for p in coords.dropFirst() { path.addLine(to: p) }
                    ctx.stroke(path, with: .color(FarmanTheme.wine), lineWidth: 3)
                    for p in coords {
                        ctx.fill(Path(ellipseIn: CGRect(x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9)), with: .color(FarmanTheme.wine))
                    }
                }
            }
        }.accessibilityLabel("نمودار روند فروش")
    }
}

struct ActionRequiredCard: View {
    let items: [ManagementRecord]
    private var low: [ManagementRecord] { Array(items.filter { $0.status == "رو به اتمام" }.prefix(3)) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("نیازمند اقدام", systemImage: "bell.fill").font(.headline).foregroundColor(FarmanTheme.text)
            if low.isEmpty { Text("در حال حاضر مورد فوری وجود ندارد").font(.caption).foregroundColor(FarmanTheme.secondary).padding(.vertical, 10) }
            ForEach(low) { item in
                HStack(spacing: 12) {
                    Image(systemName: "shippingbox.fill").foregroundColor(FarmanTheme.warning).frame(width: 36, height: 36).background(FarmanTheme.warning.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 9))
                    VStack(alignment: .leading) { Text(item.title).font(.subheadline.bold()); Text(item.value ?? item.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary) }
                    Spacer(); Text("رو به اتمام").font(.caption2.bold()).foregroundColor(FarmanTheme.wine).padding(7).background(FarmanTheme.wine.opacity(0.12)).clipShape(Capsule())
                }.padding(10).background(FarmanTheme.raised.opacity(0.45)).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }.padding(16).cardStyle()
    }
}

// MARK: - Operations and orders

struct OperationsView: View {
    @EnvironmentObject var store: FarmanStore
    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        HeaderView(title: "عملیات امروز", subtitle: "همه چیز در جریان است")
                        Spacer()
                        Text(store.isOnline ? "● زنده" : "آفلاین").font(.caption.bold()).foregroundColor(store.isOnline ? FarmanTheme.olive : FarmanTheme.wine).padding(10).background(FarmanTheme.surface).clipShape(Capsule())
                    }
                    LiveServiceStrip(orders: store.orders)
                    HStack(spacing: 10) {
                        NavigationLink(destination: OrdersView()) { OperationCountCard(title: "سفارش‌ها", value: store.orders.count, detail: "\(store.dashboard.activeOrders) فعال", icon: "receipt.fill", tint: FarmanTheme.wine) }
                        NavigationLink(destination: ManagementModuleDetail(module: ManagementModule(key: "tables", title: "میزها", subtitle: "وضعیت لحظه‌ای میزها", icon: "table.furniture", color: FarmanTheme.olive))) { OperationCountCard(title: "میزها", value: store.management["tables"]?.count ?? 0, detail: "مدیریت میز", icon: "table.furniture", tint: FarmanTheme.olive) }
                        NavigationLink(destination: ManagementModuleDetail(module: ManagementModule(key: "reservations", title: "رزروها", subtitle: "رزروهای امروز", icon: "calendar", color: FarmanTheme.secondary))) { OperationCountCard(title: "رزروها", value: store.management["reservations"]?.count ?? 0, detail: "امروز", icon: "calendar", tint: FarmanTheme.secondary) }
                    }.buttonStyle(.plain)
                    SectionTitle("اقدام فوری")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(Array(store.orders.filter { ["PENDING", "CONFIRMED", "PREPARING"].contains($0.status) }.prefix(4))) { order in
                                NavigationLink(destination: OrderDetailView(order: order)) { OrderTicketCard(order: order) }.buttonStyle(.plain)
                            }
                        }
                    }
                    SectionTitle("رزروهای پیش رو")
                    CompactRecordsCard(records: Array((store.management["reservations"] ?? []).prefix(3)), icon: "calendar")
                    if store.orders.isEmpty { EmptyInline(text: "سفارشی در کش محلی وجود ندارد") }
                }.padding(16).padding(.top, store.isOnline ? 0 : 34)
            }.refreshable { await store.refreshQuietly() }
        }.navigationBarHidden(true)
    }
}

struct OperationCountCard: View {
    let title: String
    let value: Int
    let detail: String
    let icon: String
    let tint: Color
    var body: some View {
        VStack(spacing: 9) {
            Image(systemName: icon).font(.headline).foregroundColor(tint).frame(width: 42, height: 42).background(tint.opacity(0.16)).clipShape(RoundedRectangle(cornerRadius: 12))
            Text(title).font(.caption.bold()).foregroundColor(FarmanTheme.text)
            Text(faNumber(value)).font(.title2.bold()).foregroundColor(FarmanTheme.text)
            Text(detail).font(.caption2).foregroundColor(FarmanTheme.secondary)
        }.frame(maxWidth: .infinity).padding(.vertical, 14).cardStyle()
    }
}

struct OrderTicketCard: View {
    let order: FarmanOrder
    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack { StatusPill(status: order.status, label: order.statusLabel); Spacer(); Text("#\(order.id.prefix(4))").font(.caption.bold()) }
            Text(order.customerName).font(.headline)
            Label("\(order.itemCount) آیتم • \(order.tableLabel ?? "بیرون‌بر")", systemImage: "fork.knife").font(.caption).foregroundColor(FarmanTheme.secondary)
            Divider().background(FarmanTheme.border)
            Text("مشاهده جزئیات ‹").font(.caption.bold()).frame(maxWidth: .infinity).padding(10).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 10))
        }.frame(width: 220, alignment: .leading).padding(14).cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct CompactRecordsCard: View {
    let records: [ManagementRecord]
    let icon: String
    var body: some View {
        VStack(spacing: 0) {
            ForEach(records) { record in
                HStack(spacing: 12) {
                    Image(systemName: icon).foregroundColor(FarmanTheme.olive)
                    VStack(alignment: .leading) { Text(record.title).font(.subheadline.bold()); Text(record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary) }
                    Spacer(); Text(record.status ?? "").font(.caption2).foregroundColor(FarmanTheme.olive)
                }.padding(13)
                if record.id != records.last?.id { Divider().background(FarmanTheme.border) }
            }
            if records.isEmpty { EmptyInline(text: "موردی ثبت نشده است") }
        }.cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct OrdersView: View {
    @EnvironmentObject var store: FarmanStore
    @State private var selectedOrder: FarmanOrder?
    @State private var query = ""
    @State private var filter = "ALL"
    private let filters = [("ALL", "همه"), ("PENDING", "در انتظار"), ("PREPARING", "آماده‌سازی"), ("READY", "آماده تحویل"), ("COMPLETED", "تکمیل")]
    private var visibleOrders: [FarmanOrder] {
        store.orders.filter { order in
            (filter == "ALL" || order.status == filter) &&
            (query.isEmpty || order.customerName.localizedCaseInsensitiveContains(query) || order.id.localizedCaseInsensitiveContains(query))
        }
    }
    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    HeaderView(title: "سفارش‌ها", subtitle: "همه سفارش‌های کافه در یک نگاه")
                    HStack { Image(systemName: "magnifyingglass"); TextField("جستجوی سفارش", text: $query) }.padding(14).background(FarmanTheme.surface).overlay(RoundedRectangle(cornerRadius: 16).stroke(FarmanTheme.border)).clipShape(RoundedRectangle(cornerRadius: 16))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filters, id: \.0) { item in
                                Button { filter = item.0 } label: { Text(item.1).font(.caption.bold()).padding(.horizontal, 15).padding(.vertical, 10).background(filter == item.0 ? FarmanTheme.oliveDark : FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border.opacity(filter == item.0 ? 0 : 1))) }.buttonStyle(.plain)
                            }
                        }
                    }
                    ForEach(visibleOrders) { order in Button { selectedOrder = order } label: { OrderRow(order: order) }.buttonStyle(.plain) }
                    if visibleOrders.isEmpty { EmptyInline(text: "سفارشی با این فیلتر پیدا نشد") }
                }.padding(16)
            }.refreshable { await store.refreshQuietly() }
        }
        .navigationBarHidden(true)
        .sheet(item: $selectedOrder) { order in OrderActionSheet(order: order).environmentObject(store) }
    }
}

struct OrderRow: View {
    let order: FarmanOrder
    var body: some View {
        VStack(spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: order.orderType == "TABLE" ? "fork.knife.circle.fill" : "takeoutbag.and.cup.and.straw.fill")
                    .font(.title2).foregroundColor(FarmanTheme.olive).frame(width: 48, height: 48).background(FarmanTheme.olive.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 5) { Text("سفارش \(order.id.prefix(6))").font(.headline); Text(order.customerName).font(.caption).foregroundColor(FarmanTheme.secondary); Label(order.tableLabel ?? "بیرون‌بر", systemImage: order.orderType == "TABLE" ? "table.furniture" : "bag.fill").font(.caption).foregroundColor(FarmanTheme.secondary) }
                Spacer(); StatusPill(status: order.status, label: order.statusLabel)
            }
            Divider().background(FarmanTheme.border)
            HStack { Text("\(faNumber(order.itemCount)) آیتم").foregroundColor(FarmanTheme.secondary); Spacer(); Text(money(Double(order.total))).font(.headline) }
        }.padding(16).cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct StatusPill: View {
    let status: String
    let label: String
    private var tint: Color { ["READY", "COMPLETED"].contains(status) ? FarmanTheme.olive : FarmanTheme.wine }
    var body: some View { Text(label).font(.caption2.bold()).foregroundColor(tint).padding(.horizontal, 10).padding(.vertical, 7).background(tint.opacity(0.14)).clipShape(Capsule()) }
}

struct OrderDetailView: View {
    @EnvironmentObject private var store: FarmanStore
    let order: FarmanOrder
    var body: some View {
        ScreenBackground {
            VStack(spacing: 14) {
                OrderRow(order: order)
                Text("تغییر وضعیت سفارش").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                ForEach(order.allowedNext, id: \.self) { status in
                    let destructive = (status == "CANCELLED")
                    Button { Task { await store.update(order: order, to: status) } } label: {
                        Label(statusTitle(status), systemImage: destructive ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .frame(maxWidth: .infinity).padding(15)
                    }
                    .buttonStyle(.plain)
                    .background(destructive ? FarmanTheme.surface : FarmanTheme.wine)
                    .foregroundColor(destructive ? FarmanTheme.wine : .white)
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(destructive ? FarmanTheme.wine.opacity(0.6) : .clear))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .disabled(!store.isOnline)
                }
                if !store.isOnline { Label("برای تغییر وضعیت به سرور متصل شوید", systemImage: "wifi.slash").font(.caption).foregroundColor(FarmanTheme.warning) }
                Spacer()
            }.padding(16).foregroundColor(FarmanTheme.text)
        }.navigationTitle("جزئیات سفارش")
    }
}

struct OrderActionSheet: View {
    @EnvironmentObject var store: FarmanStore
    @Environment(\.dismiss) var dismiss
    let order: FarmanOrder
    var body: some View {
        ZStack {
            FarmanTheme.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Capsule().fill(FarmanTheme.border).frame(width: 44, height: 5).frame(maxWidth: .infinity)
                Text("سفارش \(order.id.prefix(8))").font(.title2.bold())
                OrderRow(order: order)
                Text("تغییر وضعیت").font(.headline)
                ForEach(order.allowedNext, id: \.self) { status in
                    Button {
                        Task { await store.update(order: order, to: status); dismiss() }
                    } label: {
                        Text(statusTitle(status)).frame(maxWidth: .infinity).padding(15)
                    }.buttonStyle(.plain).background(FarmanTheme.olive).foregroundColor(FarmanTheme.background).clipShape(RoundedRectangle(cornerRadius: 14)).disabled(!store.isOnline)
                }
                if !store.isOnline { Label("برای تغییر وضعیت به سرور متصل شوید", systemImage: "wifi.slash").font(.caption).foregroundColor(FarmanTheme.warning) }
                Spacer()
            }.padding(20).foregroundColor(FarmanTheme.text)
        }
    }
}

// MARK: - Management

struct ManagementModule: Identifiable {
    var id: String { "\(key)-\(title)" }
    let key: String
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
}

struct ManagementView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var query = ""
    let modules = [
        ManagementModule(key: "products", title: "محصولات", subtitle: "مدیریت آیتم‌های منو، قیمت و موجودی", icon: "takeoutbag.and.cup.and.straw.fill", color: FarmanTheme.wine),
        ManagementModule(key: "categories", title: "دسته‌ها", subtitle: "سازمان‌دهی و ویرایش دسته‌های منو", icon: "square.grid.2x2.fill", color: FarmanTheme.olive),
        ManagementModule(key: "ingredients", title: "مواد اولیه", subtitle: "موجودی، حداقل و تأمین‌کنندگان", icon: "leaf.fill", color: FarmanTheme.olive),
        ManagementModule(key: "allergens", title: "آلرژن‌ها", subtitle: "مدیریت مواد حساسیت‌زا در منو", icon: "exclamationmark.triangle.fill", color: FarmanTheme.olive),
        ManagementModule(key: "customers", title: "مشتریان", subtitle: "اطلاعات مشتری و سوابق سفارش", icon: "person.2.fill", color: FarmanTheme.wine),
        ManagementModule(key: "tables", title: "میزها", subtitle: "وضعیت آزاد یا اشغال میزها", icon: "table.furniture", color: FarmanTheme.olive),
        ManagementModule(key: "reservations", title: "رزروها", subtitle: "مدیریت رزرو و حضور مهمان", icon: "calendar", color: FarmanTheme.wine),
        ManagementModule(key: "ratings", title: "نظرات", subtitle: "بازخورد و امتیاز مشتریان", icon: "star.bubble.fill", color: FarmanTheme.olive),
        ManagementModule(key: "finance", title: "گزارش مالی", subtitle: "درآمد، هزینه‌ها و روند فروش", icon: "chart.bar.fill", color: FarmanTheme.wine),
        ManagementModule(key: "staff", title: "پرسنل", subtitle: "کارکنان و وضعیت فعالیت", icon: "person.3.fill", color: FarmanTheme.olive),
        ManagementModule(key: "leaves", title: "مرخصی‌ها", subtitle: "درخواست‌ها و تأیید مرخصی پرسنل", icon: "beach.umbrella.fill", color: FarmanTheme.olive),
        ManagementModule(key: "cashier", title: "دسترسی صندوق‌دار", subtitle: "نقش‌ها و مسئولیت‌های کاربران", icon: "lock.shield.fill", color: FarmanTheme.wine),
        ManagementModule(key: "qr", title: "کدهای QR", subtitle: "لینک منو و سفارش سریع میز", icon: "qrcode", color: FarmanTheme.olive),
        ManagementModule(key: "settings", title: "تنظیمات", subtitle: "پیکربندی سرویس‌ها و کافه", icon: "gearshape.fill", color: FarmanTheme.wine)
    ]

    private var filteredModules: [ManagementModule] {
        query.isEmpty ? modules : modules.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.subtitle.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top) {
                        HeaderView(title: "مدیریت کافه", subtitle: "همه‌چیز برای مدیریت بهتر کافه شما")
                        Image(systemName: "cup.and.saucer.fill").foregroundColor(FarmanTheme.wine).frame(width: 52, height: 52).background(FarmanTheme.wine.opacity(0.15)).clipShape(Circle())
                    }
                    HStack { Image(systemName: "magnifyingglass"); TextField("جستجوی منو، محصول یا…", text: $query) }.padding(14).background(FarmanTheme.surface).overlay(RoundedRectangle(cornerRadius: 16).stroke(FarmanTheme.border)).clipShape(RoundedRectangle(cornerRadius: 16))
                    if store.dashboard.lowStock > 0 {
                        NavigationLink(destination: ManagementModuleDetail(module: modules[2])) {
                            HStack(spacing: 12) {
                                Image(systemName: "exclamationmark.triangle.fill").font(.title2).foregroundColor(FarmanTheme.wine).frame(width: 48, height: 48).background(FarmanTheme.wine.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 13))
                                VStack(alignment: .leading) { Text("\(faNumber(store.dashboard.lowStock)) قلم موجودی در آستانه اتمام است!").font(.subheadline.bold()); Text("برای جلوگیری از توقف سرویس، موجودی را بررسی کنید.").font(.caption).foregroundColor(FarmanTheme.secondary) }
                                Spacer(); Image(systemName: "chevron.left")
                            }.padding(14).background(FarmanTheme.wine.opacity(0.1)).overlay(RoundedRectangle(cornerRadius: 16).stroke(FarmanTheme.wine.opacity(0.65))).clipShape(RoundedRectangle(cornerRadius: 16)).foregroundColor(FarmanTheme.text)
                        }.buttonStyle(.plain)
                    }
                    SectionTitle("منو و موجودی")
                    ForEach(Array(filteredModules.prefix(5))) { module in ManagementNavigationRow(module: module, count: store.management[module.key]?.count ?? 0) }
                    if query.isEmpty {
                        SectionTitle("کسب‌وکار")
                        ForEach(Array(filteredModules.dropFirst(5))) { module in ManagementNavigationRow(module: module, count: store.management[module.key]?.count ?? 0) }
                    }
                    SyncFooter()
                }.padding(16).padding(.top, 2)
            }
        }.navigationBarHidden(true)
    }
}

struct ManagementNavigationRow: View {
    let module: ManagementModule
    let count: Int
    var body: some View {
        NavigationLink(destination: ManagementModuleDetail(module: module)) {
            HStack(spacing: 13) {
                Image(systemName: module.icon).font(.headline).foregroundColor(module.color).frame(width: 46, height: 46).background(module.color.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 4) { Text(module.title).font(.headline); Text(module.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary).lineLimit(1) }
                Spacer(); Text(faNumber(count)).font(.caption.bold()).foregroundColor(module.color).padding(.horizontal, 10).padding(.vertical, 7).background(module.color.opacity(0.12)).clipShape(Capsule()); Image(systemName: "chevron.left").font(.caption)
            }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
        }.buttonStyle(.plain)
    }
}

struct ManagementModuleDetail: View {
    @EnvironmentObject private var store: FarmanStore
    let module: ManagementModule
    @State private var query = ""
    @State private var showReservationSheet = false
    private var records: [ManagementRecord] {
        let source = store.management[module.key] ?? []
        return query.isEmpty ? source : source.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.subtitle.localizedCaseInsensitiveContains(query) }
    }
    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if module.key == "finance" {
                        FinanceDashboardCard(dashboard: store.dashboard)
                    }
                    if module.key == "reservations" {
                        Button { showReservationSheet = true } label: {
                            Label("رزرو جدید", systemImage: "plus")
                                .font(.headline).frame(maxWidth: .infinity).padding(15)
                                .background(FarmanTheme.olive).foregroundColor(FarmanTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }.buttonStyle(.plain).disabled(!store.isOnline)
                    }
                    HStack { Image(systemName: "magnifyingglass"); TextField("جستجو در \(module.title)", text: $query) }.padding(13).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 14))
                    if records.isEmpty {
                        VStack(spacing: 10) {
                            EmptyInline(text: store.isOnline ? "موردی در این بخش ثبت نشده است" : "داده ذخیره‌شده‌ای برای این بخش وجود ندارد")
                            if module.key == "reservations" && store.isOnline {
                                Button("ثبت اولین رزرو") { showReservationSheet = true }
                                    .font(.subheadline.bold()).foregroundColor(FarmanTheme.olive)
                            }
                        }
                    }
                    ForEach(records) { record in
                        if module.key == "finance" {
                            NavigationLink(destination: FinanceDetailView(record: record)) {
                                ManagementRecordCard(module: module, record: record)
                            }.buttonStyle(.plain)
                        } else {
                            ManagementRecordCard(module: module, record: record)
                        }
                    }
                }.padding(16)
            }.refreshable { await store.refreshQuietly() }
        }
        .navigationTitle(module.title)
        .sheet(isPresented: $showReservationSheet) {
            ReservationCreateView().environmentObject(store)
        }
    }
}

struct FinanceDashboardCard: View {
    let dashboard: DashboardSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("نمای مالی زنده", systemImage: "chart.bar.fill").font(.headline)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                VStack(alignment: .leading) { Text("فروش امروز").font(.caption).foregroundColor(FarmanTheme.secondary); Text(money(dashboard.todayRevenue)).font(.headline) }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(FarmanTheme.raised.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading) { Text("فروش ماه").font(.caption).foregroundColor(FarmanTheme.secondary); Text(money(dashboard.monthRevenue)).font(.headline) }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(FarmanTheme.raised.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading) { Text("سفارش امروز").font(.caption).foregroundColor(FarmanTheme.secondary); Text(faNumber(dashboard.todayOrders)).font(.headline) }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(FarmanTheme.raised.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading) { Text("سفارش فعال").font(.caption).foregroundColor(FarmanTheme.secondary); Text(faNumber(dashboard.activeOrders)).font(.headline) }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(FarmanTheme.raised.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 12))
            }
            if !dashboard.topProducts.isEmpty {
                Divider().background(FarmanTheme.border)
                Text("پرفروش‌ترین‌ها").font(.subheadline.bold())
                ForEach(dashboard.topProducts.prefix(3)) { p in
                    HStack { Text(p.name).font(.caption); Spacer(); Text(money(p.revenue)).font(.caption.bold()) }
                }
            }
        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
    }
}

struct FinanceDetailView: View {
    @EnvironmentObject private var store: FarmanStore
    let record: ManagementRecord
    var body: some View {
        ScreenBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    FinanceDashboardCard(dashboard: store.dashboard)
                    RevenueChart(points: store.dashboard.daily)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(record.title).font(.headline)
                        Text(record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary)
                        Text("این گزارش از داده زنده سرور ساخته می‌شود؛ برای به‌روزرسانی صفحه را پایین بکشید.")
                            .font(.caption).foregroundColor(FarmanTheme.secondary)
                    }.padding(14).cardStyle()
                    SyncFooter()
                }.padding(16).foregroundColor(FarmanTheme.text)
            }.refreshable { await store.refreshQuietly() }
        }.navigationTitle(record.title)
    }
}

struct ReservationCreateView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    @State private var tableId = ""
    @State private var name = ""
    @State private var phone = ""
    @State private var guests = 2
    @State private var date = Date().addingTimeInterval(3600)
    @State private var duration = 60
    @State private var saving = false
    private var tables: [ManagementRecord] { store.management["tables"] ?? [] }
    var body: some View {
        NavigationView {
            ZStack {
                FarmanTheme.background.ignoresSafeArea()
                Form {
                    Section("میز") {
                        Picker("میز", selection: $tableId) {
                            Text("انتخاب کنید").tag("")
                            ForEach(tables) { t in Text("\(t.title) • \(t.status ?? "")").tag(t.id) }
                        }
                    }
                    Section("مهمان") {
                        TextField("نام مشتری", text: $name)
                        TextField("تلفن (اختیاری)", text: $phone).keyboardType(.phonePad)
                        Stepper("نفرات: \(faNumber(guests))", value: $guests, in: 1...40)
                        DatePicker("زمان رزرو", selection: $date, in: Date()...)
                        Picker("مدت", selection: $duration) {
                            Text("۳۰ دقیقه").tag(30); Text("۱ ساعت").tag(60)
                            Text("۹۰ دقیقه").tag(90); Text("۲ ساعت").tag(120)
                        }
                    }
                    Section {
                        Button {
                            saving = true
                            Task {
                                let ok = await store.createReservation(
                                    tableId: tableId, customerName: name.trimmingCharacters(in: .whitespaces),
                                    phone: phone, guests: guests, date: date, durationMin: duration)
                                saving = false
                                if ok { dismiss() }
                            }
                        } label: {
                            HStack { if saving { ProgressView() }; Text("ثبت رزرو").bold().frame(maxWidth: .infinity) }
                        }.disabled(tableId.isEmpty || name.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                        if !store.isOnline { Text("برای ثبت رزرو به سرور متصل شوید").font(.caption).foregroundColor(FarmanTheme.warning) }
                    }
                }
            }
            .navigationTitle("رزرو جدید")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("بستن") { dismiss() } } }
            .onAppear { if tableId.isEmpty { tableId = tables.first?.id ?? "" } }
        }.environment(\.layoutDirection, .rightToLeft)
    }
}

struct ManagementRecordCard: View {
    @EnvironmentObject private var store: FarmanStore
    let module: ManagementModule
    let record: ManagementRecord
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: module.icon).foregroundColor(module.color).frame(width: 42, height: 42).background(module.color.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 4) { Text(record.title).font(.headline); Text(record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary); if let value = record.value { Text(value).font(.caption.bold()).foregroundColor(FarmanTheme.text) } }
                Spacer(); if let status = record.status { Text(statusTitle(status)).font(.caption2.bold()).foregroundColor(module.color).padding(7).background(module.color.opacity(0.12)).clipShape(Capsule()) }
            }
            actionControls
        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
    }

    @ViewBuilder private var actionControls: some View {
        if record.action == "ingredientAdjust" {
            HStack {
                Button { Task { await store.perform(record: record, amount: -1) } } label: { Label("کاهش", systemImage: "minus") }
                Spacer()
                Button { Task { await store.perform(record: record, amount: 1) } } label: { Label("افزایش", systemImage: "plus") }
            }.font(.caption.bold()).buttonStyle(.bordered).tint(module.color).disabled(!store.isOnline)
        } else if record.action == "reservationStatus" {
            HStack {
                Button("مهمان نشست") { Task { await store.perform(record: record, status: "SEATED") } }
                Spacer()
                Button("لغو رزرو", role: .destructive) { Task { await store.perform(record: record, status: "CANCELLED") } }
            }.font(.caption.bold()).buttonStyle(.bordered).disabled(!store.isOnline)
        } else if record.action == "leaveStatus" {
            if record.enabled ?? false {
                HStack {
                    Button("تأیید") { Task { await store.perform(record: record, status: "APPROVED") } }
                    Spacer()
                    Button("رد", role: .destructive) { Task { await store.perform(record: record, status: "REJECTED") } }
                }.font(.caption.bold()).buttonStyle(.bordered).disabled(!store.isOnline)
            }
        } else if record.action == "ratingDelete" {
            Button(role: .destructive) { Task { await store.perform(record: record) } } label: { Label("حذف نظر", systemImage: "trash") }.font(.caption.bold()).buttonStyle(.bordered).disabled(!store.isOnline)
        } else if record.action != nil {
            Button { Task { await store.perform(record: record, enabled: !(record.enabled ?? false)) } } label: {
                Label((record.enabled ?? false) ? "غیرفعال کردن" : "فعال کردن", systemImage: (record.enabled ?? false) ? "pause.circle" : "checkmark.circle")
                    .font(.caption.bold()).frame(maxWidth: .infinity).padding(10)
            }.buttonStyle(.plain).background(module.color.opacity(0.16)).foregroundColor(module.color).clipShape(RoundedRectangle(cornerRadius: 11)).disabled(!store.isOnline)
        }
    }
}

// MARK: - Assistant and more

struct ChatMessage: Identifiable { let id = UUID(); let text: String; let isUser: Bool }

struct AssistantView: View {
    @EnvironmentObject var store: FarmanStore
    @State private var question = ""
    @State private var messages: [ChatMessage] = [ChatMessage(text: "سلام! درباره فروش، موجودی یا عملیات کافه از من بپرس.", isUser: false)]
    @State private var sending = false

    var body: some View {
        ScreenBackground {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        HStack {
                            Button { messages = Array(messages.prefix(1)) } label: { Image(systemName: "clock.arrow.circlepath").font(.title2).frame(width: 46, height: 46).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 14)) }
                            Spacer()
                            VStack(spacing: 5) { Text("دستیار فرمان").font(.system(size: 28, weight: .black, design: .rounded)); Label(store.isOnline ? "اطلاعات شما امن است" : "حالت آفلاین", systemImage: "lock.fill").font(.caption).foregroundColor(store.isOnline ? FarmanTheme.olive : FarmanTheme.wine) }
                            Spacer()
                            Image(systemName: "cup.and.saucer.fill").font(.title2).foregroundColor(.white).frame(width: 52, height: 52).background(FarmanTheme.raised).clipShape(Circle()).overlay(Circle().stroke(FarmanTheme.border))
                        }
                        Text("امروز • کافه فرمان").font(.subheadline).padding(.horizontal, 24).padding(.vertical, 10).background(FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border))
                        AssistantSummaryCard(dashboard: store.dashboard)
                        if let low = (store.management["ingredients"] ?? []).first(where: { $0.status == "رو به اتمام" }) {
                            AssistantInventoryCard(record: low)
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(["فروش امروز چطور بوده؟", "چه چیزی رو به اتمام است؟", "سفارش‌های فعال را تحلیل کن"], id: \.self) { prompt in
                                    Button(prompt) { send(prompt) }.font(.caption.bold()).padding(.horizontal, 13).padding(.vertical, 9).background(FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border)).disabled(!store.isOnline)
                                }
                            }
                        }
                        ForEach(messages) { message in
                            HStack { if message.isUser { Spacer() }; Text(message.text).padding(13).background(message.isUser ? FarmanTheme.olive : FarmanTheme.surface).foregroundColor(message.isUser ? FarmanTheme.background : FarmanTheme.text).clipShape(RoundedRectangle(cornerRadius: 16)); if !message.isUser { Spacer() } }
                        }
                    }.padding(16).padding(.top, store.isOnline ? 0 : 34)
                }
                HStack(spacing: 10) {
                    TextField("از فرمان بپرس…", text: $question).padding(14).background(FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border))
                    Button { send(question) } label: { Image(systemName: "paperplane.fill").font(.headline).frame(width: 48, height: 48).background(FarmanTheme.wine).foregroundColor(.white).clipShape(Circle()) }.disabled(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending || !store.isOnline)
                }.padding(14).overlay(Divider().background(FarmanTheme.border), alignment: .top)
            }.foregroundColor(FarmanTheme.text)
        }.navigationBarHidden(true)
    }

    private func send(_ input: String) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(ChatMessage(text: text, isUser: true)); question = ""; sending = true
        Task {
            do { messages.append(ChatMessage(text: try await store.askAssistant(text), isUser: false)) }
            catch { messages.append(ChatMessage(text: error.localizedDescription, isUser: false)) }
            sending = false
        }
    }
}

struct AssistantSummaryCard: View {
    let dashboard: DashboardSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Image(systemName: "chart.bar.fill").font(.title2).foregroundColor(FarmanTheme.wine).frame(width: 48, height: 48).background(FarmanTheme.wine.opacity(0.15)).clipShape(Circle()); Text("سلام!\nتا این لحظه فروش کافه \(money(dashboard.todayRevenue)) بوده است.").font(.headline); Spacer() }
            Divider().background(FarmanTheme.border)
            HStack {
                Label("\(faNumber(dashboard.todayOrders)) سفارش", systemImage: "fork.knife").frame(maxWidth: .infinity)
                Divider().frame(height: 38).background(FarmanTheme.border)
                VStack { Text("میانگین هر سفارش").font(.caption2).foregroundColor(FarmanTheme.secondary); Text(dashboard.todayOrders > 0 ? money(dashboard.todayRevenue / Double(dashboard.todayOrders)) : "۰ تومان").font(.caption.bold()) }.frame(maxWidth: .infinity)
            }
        }.padding(16).cardStyle()
    }
}

struct AssistantInventoryCard: View {
    let record: ManagementRecord
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "exclamationmark.triangle.fill").font(.title2).foregroundColor(FarmanTheme.wine); VStack(alignment: .leading) { Text("موجودی برخی اقلام در حال اتمام است.").font(.headline); Text("بهتر است به‌زودی سفارش داده شوند.").font(.caption).foregroundColor(FarmanTheme.secondary) }; Spacer() }
            HStack { Image(systemName: "shippingbox.fill").foregroundColor(FarmanTheme.warning); VStack(alignment: .leading) { Text(record.title).font(.subheadline.bold()); Text(record.value ?? record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary) }; Spacer() }
        }.padding(16).cardStyle()
    }
}

struct MoreView: View {
    @EnvironmentObject var store: FarmanStore
    @State private var serverText = UserDefaults.standard.string(forKey: "farman-server-url") ?? "http://172.20.10.5:3080"
    var body: some View {
        ScreenBackground {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill").font(.system(size: 44)).foregroundColor(FarmanTheme.olive)
                        VStack(alignment: .leading) { Text(store.user?.name ?? "مدیر").fontWeight(.bold); Text(store.user?.email ?? "حساب ذخیره‌شده").font(.caption).foregroundColor(FarmanTheme.secondary) }
                    }.padding(.vertical, 8)
                }
                Section("وضعیت") {
                    Label(store.isOnline ? "سرور متصل" : "حالت آفلاین", systemImage: store.isOnline ? "network" : "wifi.slash")
                    Text(store.serverLabel).font(.caption).foregroundColor(FarmanTheme.secondary)
                    if !store.isOnline {
                        Text("گوشی روی LTE است ولی سرور روی وای‌فای/هات‌اسپات مک است؛ به همان شبکه وصل شوید.")
                            .font(.caption).foregroundColor(FarmanTheme.warning)
                    }
                    if let date = store.lastSync { HStack { Label("آخرین همگام‌سازی", systemImage: "clock"); Spacer(); Text(date, style: .relative).foregroundColor(FarmanTheme.secondary) } }
                    Button { Task { await store.pingServerThenBootstrap() } } label: { Label("تلاش اتصال مجدد", systemImage: "arrow.triangle.2.circlepath") }
                    Button { Task { await store.refreshQuietly() } } label: { Label("همگام‌سازی الآن", systemImage: "arrow.triangle.2.circlepath") }.disabled(!store.isOnline)
                }
                Section("سرور") {
                    TextField("آدرس سرور (مثل http://172.20.10.5:3080)", text: $serverText)
                        .textInputAutocapitalization(.never).keyboardType(.URL)
                    Button("ذخیره و اتصال") {
                        FarmanStore.saveServer(serverText)
                        serverText = UserDefaults.standard.string(forKey: "farman-server-url") ?? serverText
                        Task { await store.pingServerThenBootstrap() }
                    }
                }
                Section { Button(role: .destructive) { store.logout() } label: { Label("خروج از حساب", systemImage: "rectangle.portrait.and.arrow.right") } }
            }.background(FarmanTheme.background)
        }.navigationTitle("بیشتر")
    }
}

// MARK: - Shared components

struct SectionTitle: View {
    let title: String; var action: String?; var handler: (() -> Void)?
    init(_ title: String, action: String? = nil, handler: (() -> Void)? = nil) { self.title = title; self.action = action; self.handler = handler }
    var body: some View { HStack { Text(title).font(.headline); Spacer(); if let action, let handler { Button(action, action: handler).font(.caption).foregroundColor(FarmanTheme.olive) } }.foregroundColor(FarmanTheme.text) }
}

struct EmptyInline: View {
    let text: String
    var body: some View { Text(text).font(.caption).foregroundColor(FarmanTheme.secondary).frame(maxWidth: .infinity).padding(24) }
}

struct SyncFooter: View {
    @EnvironmentObject var store: FarmanStore
    var body: some View {
        HStack { Image(systemName: store.isOnline ? "checkmark.icloud.fill" : "externaldrive.fill"); Text(store.isOnline ? "اطلاعات با سرور همگام است" : "داده‌ها از حافظه دستگاه خوانده شده‌اند"); Spacer(); if store.isBusy { ProgressView().tint(FarmanTheme.olive) } }
            .font(.caption).foregroundColor(FarmanTheme.secondary).padding(14).cardStyle()
    }
}

extension View {
    func cardStyle() -> some View {
        self.background(LinearGradient(colors: [FarmanTheme.surface, FarmanTheme.deepBrown.opacity(0.96)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(FarmanTheme.border.opacity(0.7), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}

func money(_ value: Double) -> String {
    let formatter = NumberFormatter(); formatter.numberStyle = .decimal; formatter.maximumFractionDigits = 0
    return "\(formatter.string(from: NSNumber(value: value)) ?? "0") تومان"
}

func faNumber(_ value: Int) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "fa_IR")
    formatter.numberStyle = .decimal
    return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
}

func statusTitle(_ value: String) -> String {
    ["PENDING": "در انتظار", "CONFIRMED": "تأیید", "PREPARING": "در حال آماده‌سازی", "READY": "آماده", "READY_TO_SERVE": "آماده سرو", "COMPLETED": "تکمیل", "CANCELLED": "لغو", "APPROVED": "تأیید شد", "REJECTED": "رد شد"][value] ?? value
}
