import SwiftUI
import Network
import WebKit
import CoreImage.CIFilterBuiltins

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

// MARK: - Staff pay models (mirror /api/admin/staff/[id]/pay* JSON)

struct PayRateRecord: Codable, Identifiable {
    let id: String
    let payType: String
    let amount: Int
    let effectiveAt: String
    let note: String?
}

struct PayOverview: Codable {
    let rates: [PayRateRecord]
    let current: PayRateRecord?
    let editableIds: [String]
    let currentHourlyPreview: Int?
}

struct PayDayEstimate: Codable {
    let payType: String?
    let regularMin: Int
    let overtimeMin: Int
    let regularPay: Int
    let overtimePay: Int
    let totalPay: Int
    let note: String?
}

struct PayEstimateDay: Codable, Identifiable {
    var id: String { date }
    let date: String
    let workedMin: Int
    let overtimeMin: Int
    let estimate: PayDayEstimate
}

struct PayEstimateSummary: Codable {
    let totalPay: Int
    let totalWorkedMin: Int
    let totalOvertimeMin: Int
    let dayCount: Int
}

struct PayEstimateResponse: Codable {
    let days: [PayEstimateDay]
    let summary: PayEstimateSummary
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
    @Published var isCheckingConnection = false
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
                if path.status != .satisfied { self?.isOnline = false }
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
        isCheckingConnection = true
        defer { isCheckingConnection = false }
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
            if !(await resolveServer()) {
                isOnline = false
                throw APIError(message: "سرور \(serverLabel) در دسترس نیست؛ نسخه ذخیره‌شده باقی ماند.")
            }
            throw error
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
        guard !isBusy && !isCheckingConnection else { return }
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

    /// Owner (or legacy ADMIN) — only these accounts may use the management
    /// write APIs. The server enforces this per-endpoint; the flag only hides
    /// owner-only sections so cashiers never see dead-end buttons.
    var isOwner: Bool { user?.role == "OWNER" || user?.role == "ADMIN" }

    /// Re-read the mobile overview after a mutation and persist it, so the UI
    /// always reflects the server result (never a local guess). Offline cached
    /// data stays read-only: callers must check `isOnline` first.
    @MainActor
    func refreshOverview() async throws {
        let overviewData = try await request(path: "/api/admin/mobile/overview")
        let decoded = try JSONDecoder().decode(MobileOverview.self, from: overviewData)
        management = decoded.modules
        lastSync = Date()
        saveCache()
    }

    @MainActor
    func apiJSON(path: String, method: String = "GET", payload: [String: Any]? = nil) async throws -> Any {
        guard isOnline else { throw APIError(message: "این تغییر فقط هنگام اتصال به سرور قابل انجام است.") }
        let body = try payload.map { try JSONSerialization.data(withJSONObject: $0) }
        let data = try await request(path: path, method: method, body: body)
        try await refreshOverview()
        errorMessage = nil
        return (try? JSONSerialization.jsonObject(with: data)) ?? [:]
    }

    func readJSON(path: String) async throws -> [String: Any] {
        let data = try await request(path: path)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    // MARK: Discount codes (owner only, full CRUD via the module APIs)

    @MainActor
    func createDiscount(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/discounts", method: "POST", payload: payload)
    }

    @MainActor
    func updateDiscount(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/discounts/\(id)", method: "PATCH", payload: payload)
    }

    @MainActor
    func deleteManagementRecord(module: String, id: String) async throws {
        guard isOwner, ["products", "categories", "ingredients", "staff", "tables"].contains(module) else {
            throw APIError(message: "دسترسی غیرمجاز")
        }
        _ = try await apiJSON(path: "/api/admin/\(module)/\(id)", method: "DELETE")
    }

    @MainActor
    func archiveDiscount(record: ManagementRecord) async {
        await perform(record: ManagementRecord(id: record.id, title: record.title, subtitle: record.subtitle, value: record.value, status: record.status, action: "discountArchive", enabled: record.enabled))
    }

    // MARK: Staff pay (owner only, append-only history + Tehran estimates)

    @MainActor
    func fetchPay(staffId: String) async throws -> PayOverview {
        let data = try await request(path: "/api/admin/staff/\(staffId)/pay")
        return try JSONDecoder().decode(PayOverview.self, from: data)
    }

    @MainActor
    func savePayRate(staffId: String, rateId: String?, payload: [String: Any]) async throws {
        if let rateId {
            _ = try await apiJSON(path: "/api/admin/staff/\(staffId)/pay/\(rateId)", method: "PATCH", payload: payload)
        } else {
            _ = try await apiJSON(path: "/api/admin/staff/\(staffId)/pay", method: "POST", payload: payload)
        }
    }

    @MainActor
    func deletePayRate(staffId: String, rateId: String) async throws {
        _ = try await apiJSON(path: "/api/admin/staff/\(staffId)/pay/\(rateId)", method: "DELETE", payload: [:])
    }

    @MainActor
    func fetchPayEstimate(staffId: String, from: String, to: String) async throws -> PayEstimateResponse {
        let data = try await request(path: "/api/admin/staff/\(staffId)/pay/estimate?from=\(from)&to=\(to)")
        return try JSONDecoder().decode(PayEstimateResponse.self, from: data)
    }

    // MARK: Catalog / operations CRUD (owner fields match the web forms)

    @MainActor
    func createStaff(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/staff", method: "POST", payload: payload)
    }

    @MainActor
    func updateStaff(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/staff/\(id)", method: "PUT", payload: payload)
    }

    @MainActor
    func createCategory(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/categories", method: "POST", payload: payload)
    }

    @MainActor
    func updateCategory(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/categories/\(id)", method: "PUT", payload: payload)
    }

    @MainActor
    func createIngredient(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/ingredients", method: "POST", payload: payload)
    }

    @MainActor
    func updateIngredient(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/ingredients/\(id)", method: "PUT", payload: payload)
    }

    @MainActor
    func createProduct(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/products", method: "POST", payload: payload)
    }

    @MainActor
    func updateProduct(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/products/\(id)", method: "PUT", payload: payload)
    }

    /// Full editable fields for one record (mirrors the web form fields).
    func fetchRecord(module: String, id: String) async throws -> [String: Any] {
        let data: Data
        do {
            data = try await request(path: "/api/admin/mobile/record?module=\(module)&id=\(id)")
        } catch {
            // Older running servers do not expose the native record endpoint.
            // The list endpoints for these modules already contain full fields.
            let fallback: [String: String] = ["staff": "staff", "ingredients": "ingredients"]
            guard let path = fallback[module] else { throw error }
            let list = try await request(path: "/api/admin/\(path)")
            guard let root = try JSONSerialization.jsonObject(with: list) as? [String: Any],
                  let records = (root["staff"] ?? root["ingredients"]) as? [[String: Any]],
                  let record = records.first(where: { $0["id"] as? String == id }) else { throw error }
            return record
        }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let record = root["record"] as? [String: Any] else {
            throw APIError(message: "داده رکورد نامعتبر است.")
        }
        return record
    }

    @MainActor
    func createTable(payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/tables", method: "POST", payload: payload)
    }

    @MainActor
    func updateTable(id: String, payload: [String: Any]) async throws {
        _ = try await apiJSON(path: "/api/admin/tables/\(id)", method: "PUT", payload: payload)
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
        let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let endpoint = Self.server.appendingPathComponent(String(parts[0]).trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)
        if parts.count == 2 { components?.percentEncodedQuery = String(parts[1]) }
        guard let url = components?.url else { throw APIError(message: "آدرس درخواست نامعتبر است.") }
        var request = URLRequest(url: url)
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
        .alert("Cafe 13", isPresented: Binding(
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
                    Text("Cafe 13").font(.system(size: 36, weight: .black, design: .rounded))
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
    @Environment(\.scenePhase) private var scenePhase
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
                NavigationView { AssistantView(selectedTab: $selected) }.tabItem { Label("دستیار", systemImage: "sparkles") }.tag(3)
                NavigationView { SettingsTabView() }.tabItem { Label("تنظیمات", systemImage: "gearshape.fill") }.tag(4)
            }
            .accentColor(FarmanTheme.olive)
            if !store.isOnline {
                OfflineBanner().padding(.horizontal, 12).padding(.top, 2)
            }
        }
        .background(FarmanTheme.background.ignoresSafeArea())
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                if Task.isCancelled { break }
                if store.user != nil && !store.isBusy { await store.refreshQuietly() }
            }
        }
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
                    NavigationLink(destination: OrdersView()) { LiveServiceStrip(orders: store.orders) }.buttonStyle(.plain)
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
            }
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
                    Text("Cafe 13").font(.headline)
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
            }
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
            }
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
    /// Full owner catalog. Cashiers only see the operational subset below —
    /// the server also filters `/api/admin/mobile/overview` by role.
    private var allModules: [ManagementModule] {
        [
            ManagementModule(key: "products", title: "محصولات", subtitle: "مدیریت آیتم‌های منو، قیمت و موجودی", icon: "takeoutbag.and.cup.and.straw.fill", color: FarmanTheme.wine),
            ManagementModule(key: "categories", title: "دسته‌ها", subtitle: "سازمان‌دهی و ویرایش دسته‌های منو", icon: "square.grid.2x2.fill", color: FarmanTheme.olive),
            ManagementModule(key: "discounts", title: "کدهای تخفیف", subtitle: "ساخت، ویرایش و فعال‌سازی کد تخفیف", icon: "ticket.fill", color: FarmanTheme.wine),
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
            ManagementModule(key: "qr", title: "کدهای QR", subtitle: "لینک منو و سفارش سریع میز", icon: "qrcode", color: FarmanTheme.olive)
        ]
    }

    private var modules: [ManagementModule] {
        guard store.isOwner else {
            let cashierKeys: Set<String> = ["customers", "tables", "reservations", "ratings", "leaves", "qr"]
            return allModules.filter { cashierKeys.contains($0.key) }
        }
        return allModules
    }

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
                    if store.dashboard.lowStock > 0, let ingredientsModule = modules.first(where: { $0.key == "ingredients" }) {
                        NavigationLink(destination: ManagementModuleDetail(module: ingredientsModule)) {
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

/// Complete responsive admin surface for modules whose native form is still
/// partial. It receives only the current server's session cookies and uses an
/// ephemeral WebKit store, so another account cannot inherit a prior login.
struct FullWebManagementView: View {
    @EnvironmentObject private var store: FarmanStore

    var body: some View {
        Group {
            if store.isOnline {
                AuthenticatedAdminWebView(url: FarmanStore.server.appendingPathComponent("admin"))
            } else {
                Text("برای امکانات کامل مدیریت به سرور متصل شوید.")
                    .foregroundColor(FarmanTheme.secondary).padding()
            }
        }
        .navigationTitle("مدیریت کامل")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AuthenticatedAdminWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        let cookieStore = configuration.websiteDataStore.httpCookieStore
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            cookieStore.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { _ = webView.load(URLRequest(url: url)) }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
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
    @State private var showCreateSheet = false
    @State private var editingRecord: ManagementRecord?
    private var records: [ManagementRecord] {
        let source = store.management[module.key] ?? []
        return query.isEmpty ? source : source.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.subtitle.localizedCaseInsensitiveContains(query) }
    }
    /// Modules with a native create form in this app (same fields as web).
    private var canCreate: Bool {
        guard store.isOnline && store.isOwner else { return false }
        return ["discounts", "staff", "categories", "ingredients", "products", "tables"].contains(module.key)
    }
    private var createTitle: String {
        switch module.key {
        case "discounts": return "کد تخفیف جدید"
        case "staff": return "عضو جدید"
        case "categories": return "دسته جدید"
        case "ingredients": return "ماده اولیه جدید"
        case "products": return "محصول جدید"
        case "tables": return "میز جدید"
        default: return "مورد جدید"
        }
    }
    /// Modules with a native edit form (every field from the web form).
    private var canEdit: Bool {
        guard store.isOnline && store.isOwner else { return false }
        return ["discounts", "staff", "categories", "ingredients", "products", "tables"].contains(module.key)
    }
    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if module.key == "finance" {
                        FinanceDashboardCard(dashboard: store.dashboard)
                    }
                    if module.key == "pay" {
                        StaffPayListView()
                    }
                    if module.key == "staff" && store.isOwner {
                        SectionTitle("دستمزد پرسنل")
                        StaffPayListView()
                    }
                    if module.key == "cashier" { CashierAccessView() }
                    if module.key == "qr" { QRManagementView() }
                    if module.key == "allergens" && store.isOwner { AllergenCreateView() }
                    if module.key == "reservations" {
                        Button { showReservationSheet = true } label: {
                            Label("رزرو جدید", systemImage: "plus")
                                .font(.headline).frame(maxWidth: .infinity).padding(15)
                                .background(FarmanTheme.olive).foregroundColor(FarmanTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }.buttonStyle(.plain).disabled(!store.isOnline)
                    }
                    if canCreate {
                        Button { showCreateSheet = true } label: {
                            Label(createTitle, systemImage: "plus")
                                .font(.headline).frame(maxWidth: .infinity).padding(15)
                                .background(FarmanTheme.olive).foregroundColor(FarmanTheme.background)
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                        }.buttonStyle(.plain)
                    }
                    if !["pay", "cashier", "qr"].contains(module.key) {
                        HStack { Image(systemName: "magnifyingglass"); TextField("جستجو در \(module.title)", text: $query) }.padding(13).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    if !["pay", "cashier", "qr"].contains(module.key) {
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
                            } else if module.key == "customers" {
                                CustomerLoyaltyCard(record: record)
                            } else if module.key == "allergens" {
                                AllergenCard(record: record)
                            } else {
                                ManagementRecordCard(module: module, record: record, onEdit: canEdit ? { editingRecord = record } : nil)
                            }
                        }
                    }
                }.padding(16)
            }
        }
        .navigationTitle(module.title)
        .sheet(isPresented: $showReservationSheet) {
            ReservationCreateView().environmentObject(store)
        }
        .sheet(isPresented: $showCreateSheet) {
            ModuleCreateView(moduleKey: module.key).environmentObject(store)
        }
        .sheet(item: $editingRecord) { record in
            ModuleEditView(moduleKey: module.key, record: record).environmentObject(store)
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
                    if record.id == "sales-flow" {
                        SalesFlowNativeView()
                    } else {
                        FinanceDashboardCard(dashboard: store.dashboard)
                        RevenueChart(points: store.dashboard.daily)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text(record.title).font(.headline)
                        Text(record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary)
                        Text("این گزارش از داده زنده سرور ساخته می‌شود؛ برای به‌روزرسانی صفحه را پایین بکشید.")
                            .font(.caption).foregroundColor(FarmanTheme.secondary)
                    }.padding(14).cardStyle()
                    SyncFooter()
                }.padding(16).foregroundColor(FarmanTheme.text)
            }
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
    @State private var showingDeleteConfirmation = false
    let module: ManagementModule
    let record: ManagementRecord
    var onEdit: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: module.icon).foregroundColor(module.color).frame(width: 42, height: 42).background(module.color.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 4) { Text(record.title).font(.headline); Text(record.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary); if let value = record.value { Text(value).font(.caption.bold()).foregroundColor(FarmanTheme.text) } }
                Spacer(); if let status = record.status { Text(statusTitle(status)).font(.caption2.bold()).foregroundColor(module.color).padding(7).background(module.color.opacity(0.12)).clipShape(Capsule()) }
            }
            if let onEdit, store.isOnline {
                Button { onEdit() } label: {
                    Label("ویرایش همه فیلدها", systemImage: "pencil")
                        .font(.caption.bold()).frame(maxWidth: .infinity).padding(10)
                }.buttonStyle(.plain).background(FarmanTheme.surface).foregroundColor(FarmanTheme.text).clipShape(RoundedRectangle(cornerRadius: 11))
            }
            if onEdit != nil && store.isOnline && ["products", "categories", "ingredients", "staff", "tables"].contains(module.key) {
                Button(role: .destructive) { showingDeleteConfirmation = true } label: {
                    Label("حذف", systemImage: "trash").font(.caption.bold())
                }.buttonStyle(.bordered)
            }
            actionControls
        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
            .confirmationDialog("حذف \(record.title)؟", isPresented: $showingDeleteConfirmation) {
                Button("حذف", role: .destructive) {
                    Task {
                        do { try await store.deleteManagementRecord(module: module.key, id: record.id) }
                        catch { store.errorMessage = (error as? LocalizedError)?.errorDescription ?? "حذف انجام نشد." }
                    }
                }
            }
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
        } else if record.action == "discountActive" {
            VStack(spacing: 8) {
                Button { Task { await store.perform(record: record, enabled: !(record.enabled ?? false)) } } label: {
                    Label((record.enabled ?? false) ? "غیرفعال کردن" : "فعال کردن", systemImage: (record.enabled ?? false) ? "pause.circle" : "checkmark.circle")
                        .font(.caption.bold()).frame(maxWidth: .infinity).padding(10)
                }.buttonStyle(.plain).background(module.color.opacity(0.16)).foregroundColor(module.color).clipShape(RoundedRectangle(cornerRadius: 11)).disabled(!store.isOnline)
                if (record.status != "بایگانی") {
                    Button(role: .destructive) { Task { await store.archiveDiscount(record: record) } } label: { Label("بایگانی کد", systemImage: "archivebox") }.font(.caption.bold()).buttonStyle(.bordered).disabled(!store.isOnline)
                }
            }
        } else if record.action != nil {
            Button { Task { await store.perform(record: record, enabled: !(record.enabled ?? false)) } } label: {
                Label((record.enabled ?? false) ? "غیرفعال کردن" : "فعال کردن", systemImage: (record.enabled ?? false) ? "pause.circle" : "checkmark.circle")
                    .font(.caption.bold()).frame(maxWidth: .infinity).padding(10)
            }.buttonStyle(.plain).background(module.color.opacity(0.16)).foregroundColor(module.color).clipShape(RoundedRectangle(cornerRadius: 11)).disabled(!store.isOnline)
        }
    }
}

// MARK: - Native create / edit forms (field parity with the web forms)

/// Router for the per-module create sheets.
struct ModuleCreateView: View {
    @EnvironmentObject private var store: FarmanStore
    let moduleKey: String
    var body: some View {
        switch moduleKey {
        case "discounts": DiscountFormView(recordId: nil, initial: nil)
        case "staff": StaffFormView(recordId: nil, initial: nil)
        case "categories": CategoryFormView(recordId: nil, initial: nil)
        case "ingredients": IngredientFormView(recordId: nil, initial: nil)
        case "products": ProductFormView(recordId: nil, initial: nil)
        case "tables": TableFormView(recordId: nil, initial: nil)
        default: Text("این بخش فقط خواندنی است").padding()
        }
    }
}

/// Router for the per-module edit sheets. Loads every field via
/// `/api/admin/mobile/record` so no field is lost on save.
struct ModuleEditView: View {
    @EnvironmentObject private var store: FarmanStore
    let moduleKey: String
    let record: ManagementRecord
    @State private var fields: [String: Any]?
    @State private var error: String?
    var body: some View {
        Group {
            if let fields {
                switch moduleKey {
                case "discounts": DiscountFormView(recordId: record.id, initial: fields)
                case "staff": StaffFormView(recordId: record.id, initial: fields)
                case "categories": CategoryFormView(recordId: record.id, initial: fields)
                case "ingredients": IngredientFormView(recordId: record.id, initial: fields)
                case "products": ProductFormView(recordId: record.id, initial: fields)
                case "tables": TableFormView(recordId: record.id, initial: fields)
                default: Text("ویرایش این بخش پشتیبانی نمی‌شود").padding()
                }
            } else if let error {
                VStack(spacing: 12) {
                    Text(error).font(.subheadline).foregroundColor(FarmanTheme.warning)
                    Button("تلاش مجدد") { Task { await load() } }.buttonStyle(.bordered)
                }.padding()
            } else {
                ProgressView("در حال بارگذاری...").padding()
                    .task { await load() }
            }
        }
    }
    private func load() async {
        do {
            fields = try await store.fetchRecord(module: moduleKey, id: record.id)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "بارگذاری انجام نشد."
        }
    }
}

private func isoDate(_ value: Any?, fallback: Date = Date()) -> Date {
    guard let raw = value as? String else { return fallback }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: raw) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: raw) ?? fallback
}

private func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

private struct FormContainer<Content: View>: View {
    let title: String
    @Environment(\.dismiss) private var dismiss
    @ViewBuilder let content: Content
    var body: some View {
        NavigationView {
            ZStack {
                FarmanTheme.background.ignoresSafeArea()
                Form { content }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("بستن") { dismiss() } } }
        }.environment(\.layoutDirection, .rightToLeft)
    }
}

private struct FormError: View {
    let message: String?
    var body: some View {
        if let message {
            Text(message).font(.caption).foregroundColor(FarmanTheme.warning)
        }
    }
}

// MARK: Discount codes — unique code, percent/fixed, window, limits, status

struct DiscountFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var code = ""
    @State private var type = "PERCENT"
    @State private var value = "10"
    @State private var startsAt = Date()
    @State private var endsAt = Date().addingTimeInterval(30 * 86_400)
    @State private var minOrderAmount = ""
    @State private var maxDiscount = ""
    @State private var usageLimit = ""
    @State private var perUserLimit = ""
    @State private var isActive = true
    @State private var saving = false
    @State private var error: String?
    private var isEdit: Bool { recordId != nil }

    var body: some View {
        FormContainer(title: isEdit ? "ویرایش کد تخفیف" : "کد تخفیف جدید") {
            Section("کد") {
                TextField("مثل EID1404 (انگلیسی)", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Picker("نوع", selection: $type) {
                    Text("درصدی").tag("PERCENT"); Text("مبلغی (تومان)").tag("FIXED")
                }
                TextField(type == "PERCENT" ? "درصد (۱ تا ۱۰۰)" : "مبلغ (تومان)", text: $value)
                    .keyboardType(.numberPad)
                Toggle("فعال", isOn: $isActive)
            }
            Section("بازه زمانی") {
                DatePicker("از", selection: $startsAt)
                DatePicker("تا", selection: $endsAt)
            }
            Section("محدودیت‌ها (تومان)") {
                TextField("حداقل مبلغ سفارش", text: $minOrderAmount).keyboardType(.numberPad)
                TextField("سقف تخفیف (درصدی‌ها)", text: $maxDiscount).keyboardType(.numberPad)
                TextField("سقف کل استفاده", text: $usageLimit).keyboardType(.numberPad)
                TextField("سقف هر مشتری", text: $perUserLimit).keyboardType(.numberPad)
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            try await save()
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text(isEdit ? "ذخیره" : "ساخت کد").bold().frame(maxWidth: .infinity) }
                }.disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                FormError(message: error)
                if !store.isOnline { Text("برای ذخیره به سرور متصل شوید").font(.caption).foregroundColor(FarmanTheme.warning) }
            }
        }
        .onAppear(perform: fill)
    }

    private func fill() {
        guard let initial else { return }
        code = initial["code"] as? String ?? ""
        type = initial["type"] as? String ?? "PERCENT"
        if let v = initial["value"] as? Int { value = String(v) }
        startsAt = isoDate(initial["startsAt"])
        endsAt = isoDate(initial["endsAt"])
        if let v = initial["minOrderAmount"] as? Int, v > 0 { minOrderAmount = String(v) }
        if let v = initial["maxDiscount"] as? Int { maxDiscount = String(v) }
        if let v = initial["usageLimit"] as? Int { usageLimit = String(v) }
        if let v = initial["perUserLimit"] as? Int { perUserLimit = String(v) }
        isActive = initial["isActive"] as? Bool ?? true
    }

    private func save() async throws {
        guard let amount = Int(value.trimmingCharacters(in: .whitespaces)), amount > 0 else {
            throw APIError(message: "مقدار معتبر وارد کنید")
        }
        if type == "PERCENT" && amount > 100 { throw APIError(message: "درصد تخفیف باید بین ۱ تا ۱۰۰ باشد") }
        guard endsAt > startsAt else { throw APIError(message: "تاریخ پایان باید بعد از تاریخ شروع باشد") }
        var payload: [String: Any] = [
            "type": type,
            "value": amount,
            "startsAt": isoString(startsAt),
            "endsAt": isoString(endsAt),
            "minOrderAmount": Int(minOrderAmount) ?? 0,
            "isActive": isActive
        ]
        payload["code"] = code.trimmingCharacters(in: .whitespaces).uppercased()
        payload["maxDiscount"] = Int(maxDiscount).map { $0 as Any } ?? NSNull()
        payload["usageLimit"] = Int(usageLimit).map { $0 as Any } ?? NSNull()
        payload["perUserLimit"] = Int(perUserLimit).map { $0 as Any } ?? NSNull()
        if let recordId { try await store.updateDiscount(id: recordId, payload: payload) }
        else { try await store.createDiscount(payload: payload) }
    }
}

// MARK: Staff (name, role, task, shifts, active)

struct StaffFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var name = ""
    @State private var role = "CHEF"
    @State private var task = ""
    @State private var shiftStart = ""
    @State private var shiftEnd = ""
    @State private var isActive = true
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        FormContainer(title: recordId != nil ? "ویرایش عضو تیم" : "عضو جدید") {
            Section("مشخصات") {
                TextField("نام", text: $name)
                Picker("نقش", selection: $role) {
                    Text("شف").tag("CHEF"); Text("گارسون").tag("WAITER"); Text("سایر").tag("OTHER")
                }
                TextField("وظیفه (اختیاری)", text: $task)
                Toggle("فعال", isOn: $isActive)
            }
            Section("شیفت (HH:mm)") {
                TextField("شروع مثل 09:00", text: $shiftStart)
                TextField("پایان مثل 17:00", text: $shiftEnd)
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            var payload: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces), "role": role, "isActive": isActive]
                            let cleanTask = task.trimmingCharacters(in: .whitespaces)
                            payload["task"] = cleanTask.isEmpty ? NSNull() : cleanTask
                            payload["shiftStart"] = shiftStart.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : shiftStart
                            payload["shiftEnd"] = shiftEnd.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : shiftEnd
                            if let recordId { try await store.updateStaff(id: recordId, payload: payload) }
                            else { try await store.createStaff(payload: payload) }
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text("ذخیره").bold().frame(maxWidth: .infinity) }
                }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                FormError(message: error)
            }
        }
        .onAppear {
            guard let initial else { return }
            name = initial["name"] as? String ?? ""
            role = initial["role"] as? String ?? "CHEF"
            task = initial["task"] as? String ?? ""
            shiftStart = initial["shiftStart"] as? String ?? ""
            shiftEnd = initial["shiftEnd"] as? String ?? ""
            isActive = initial["isActive"] as? Bool ?? true
        }
    }
}

// MARK: Categories

struct CategoryFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var nameFa = ""
    @State private var nameEn = ""
    @State private var icon = ""
    @State private var description = ""
    @State private var isActive = true
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        FormContainer(title: recordId != nil ? "ویرایش دسته" : "دسته جدید") {
            Section("مشخصات") {
                TextField("نام فارسی", text: $nameFa)
                TextField("نام انگلیسی (اختیاری)", text: $nameEn)
                TextField("آیکون (اختیاری)", text: $icon)
                TextField("توضیح (اختیاری)", text: $description)
                Toggle("فعال", isOn: $isActive)
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            var payload: [String: Any] = ["nameFa": nameFa.trimmingCharacters(in: .whitespaces), "isActive": isActive]
                            payload["nameEn"] = nameEn.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : nameEn
                            payload["icon"] = icon.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : icon
                            payload["description"] = description.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : description
                            if let recordId { try await store.updateCategory(id: recordId, payload: payload) }
                            else { try await store.createCategory(payload: payload) }
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text("ذخیره").bold().frame(maxWidth: .infinity) }
                }.disabled(nameFa.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                FormError(message: error)
            }
        }
        .onAppear {
            guard let initial else { return }
            nameFa = initial["nameFa"] as? String ?? ""
            nameEn = initial["nameEn"] as? String ?? ""
            icon = initial["icon"] as? String ?? ""
            description = initial["description"] as? String ?? ""
            isActive = initial["isActive"] as? Bool ?? true
        }
    }
}

// MARK: Ingredients (stock, thresholds, cost, supplier, unit)

struct IngredientFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var nameFa = ""
    @State private var nameEn = ""
    @State private var description = ""
    @State private var isAllergen = false
    @State private var unit = "GRAM"
    @State private var stock = ""
    @State private var minQuantity = ""
    @State private var costPerUnit = ""
    @State private var supplier = ""
    @State private var isActive = true
    @State private var saving = false
    @State private var error: String?
    let units = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "UNIT"]

    var body: some View {
        FormContainer(title: recordId != nil ? "ویرایش ماده اولیه" : "ماده اولیه جدید") {
            Section("مشخصات") {
                TextField("نام فارسی", text: $nameFa)
                TextField("نام انگلیسی (اختیاری)", text: $nameEn)
                TextField("توضیح (اختیاری)", text: $description)
                Picker("واحد", selection: $unit) {
                    ForEach(units, id: \.self) { Text($0).tag($0) }
                }
                Toggle("فعال", isOn: $isActive)
                Toggle("آلرژن", isOn: $isAllergen)
            }
            Section("موجودی و هزینه") {
                TextField("موجودی", text: $stock).keyboardType(.decimalPad)
                TextField("حداقل موجودی (اختیاری)", text: $minQuantity).keyboardType(.decimalPad)
                TextField("هزینه هر واحد (اختیاری)", text: $costPerUnit).keyboardType(.decimalPad)
                TextField("تأمین‌کننده (اختیاری)", text: $supplier)
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            var payload: [String: Any] = [
                                "nameFa": nameFa.trimmingCharacters(in: .whitespaces),
                                "nameEn": nameEn.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : nameEn,
                                "description": description.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : description,
                                "unit": unit, "isActive": isActive, "isAllergen": isAllergen
                            ]
                            if let v = Double(stock) { payload["stockQuantity"] = v }
                            else if recordId == nil { payload["stockQuantity"] = 0 }
                            payload["minQuantity"] = Double(minQuantity).map { $0 as Any } ?? NSNull()
                            payload["costPerUnit"] = Double(costPerUnit).map { $0 as Any } ?? NSNull()
                            payload["supplier"] = supplier.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : supplier
                            if let recordId { try await store.updateIngredient(id: recordId, payload: payload) }
                            else { try await store.createIngredient(payload: payload) }
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text("ذخیره").bold().frame(maxWidth: .infinity) }
                }.disabled(nameFa.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                FormError(message: error)
            }
        }
        .onAppear {
            guard let initial else { return }
            nameFa = initial["nameFa"] as? String ?? ""
            nameEn = initial["nameEn"] as? String ?? ""
            description = initial["description"] as? String ?? ""
            isAllergen = initial["isAllergen"] as? Bool ?? false
            unit = initial["unit"] as? String ?? "GRAM"
            if let v = initial["stockQuantity"] as? Double { stock = String(v) }
            if let v = initial["minQuantity"] as? Double { minQuantity = String(v) }
            if let v = initial["costPerUnit"] as? Double { costPerUnit = String(v) }
            supplier = initial["supplier"] as? String ?? ""
            isActive = initial["isActive"] as? Bool ?? true
        }
    }
}

// MARK: Products (price, category, availability, featured, allergens, prep)

struct ProductFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var nameFa = ""
    @State private var nameEn = ""
    @State private var description = ""
    @State private var price = ""
    @State private var categoryId = ""
    @State private var isAvailable = true
    @State private var isFeatured = false
    @State private var allergenStatus = "FREE"
    @State private var prepBaseMin = "3"
    @State private var ingredientIds: [String] = []
    @State private var allergenIds: [String] = []
    @State private var existingImages: [[String: Any]] = []
    @State private var existingImage: String?
    @State private var existingCoffeeLines: [[String: Any]] = []
    @State private var existingIngredientQuantities: [[String: Any]] = []
    @State private var saving = false
    @State private var error: String?
    private var categories: [ManagementRecord] { store.management["categories"] ?? [] }
    private var ingredients: [ManagementRecord] { store.management["ingredients"] ?? [] }
    private var allergens: [ManagementRecord] { store.management["allergens"] ?? [] }

    var body: some View {
        FormContainer(title: recordId != nil ? "ویرایش محصول" : "محصول جدید") {
            Section("مشخصات") {
                TextField("نام فارسی", text: $nameFa)
                TextField("نام انگلیسی (اختیاری)", text: $nameEn)
                TextField("توضیح", text: $description)
                TextField("قیمت (تومان)", text: $price).keyboardType(.numberPad)
                Picker("دسته", selection: $categoryId) {
                    Text("انتخاب کنید").tag("")
                    ForEach(categories) { c in Text(c.title).tag(c.id) }
                }
            }
            Section("وضعیت") {
                Toggle("موجود", isOn: $isAvailable)
                Toggle("ویژه", isOn: $isFeatured)
                Picker("آلرژن", selection: $allergenStatus) {
                    Text("حاوی نیست").tag("FREE"); Text("حاوی است").tag("CONTAINS")
                }
                TextField("زمان آماده‌سازی (دقیقه)", text: $prepBaseMin).keyboardType(.numberPad)
            }
            Section("مواد اولیه (اختیاری)") {
                ForEach(ingredients) { ing in
                    Toggle(ing.title, isOn: Binding(
                        get: { ingredientIds.contains(ing.id) },
                        set: { on in
                            if on { ingredientIds.append(ing.id) }
                            else { ingredientIds.removeAll { $0 == ing.id } }
                        }
                    )).font(.caption)
                }
            }
            Section("آلرژن‌های محصول") {
                ForEach(allergens) { allergen in
                    Toggle(allergen.title, isOn: Binding(
                        get: { allergenIds.contains(allergen.id) },
                        set: { on in
                            if on { allergenIds.append(allergen.id) }
                            else { allergenIds.removeAll { $0 == allergen.id } }
                        }
                    )).font(.caption)
                }
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            guard let priceValue = Int(price.trimmingCharacters(in: .whitespaces)), priceValue >= 0 else {
                                throw APIError(message: "قیمت معتبر وارد کنید")
                            }
                            guard !categoryId.isEmpty else { throw APIError(message: "دسته را انتخاب کنید") }
                            let payload: [String: Any] = [
                                "nameFa": nameFa.trimmingCharacters(in: .whitespaces),
                                "nameEn": nameEn.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : nameEn,
                                "description": description.trimmingCharacters(in: .whitespaces).isEmpty ? "—" : description,
                                "price": priceValue,
                                "categoryId": categoryId,
                                "isAvailable": isAvailable,
                                "isFeatured": isFeatured,
                                "allergenStatus": allergenStatus,
                                "prepBaseMin": Int(prepBaseMin) ?? 3,
                                "ingredientIds": ingredientIds,
                                "ingredientQuantities": existingIngredientQuantities.filter { quantity in
                                    guard let id = quantity["ingredientId"] as? String else { return false }
                                    return ingredientIds.contains(id)
                                },
                                "allergenIds": allergenIds,
                                "image": existingImage.map { $0 as Any } ?? NSNull(),
                                "images": existingImages,
                                "coffeeLines": existingCoffeeLines
                            ]
                            if let recordId { try await store.updateProduct(id: recordId, payload: payload) }
                            else { try await store.createProduct(payload: payload) }
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text("ذخیره").bold().frame(maxWidth: .infinity) }
                }.disabled(nameFa.trimmingCharacters(in: .whitespaces).isEmpty || saving || !store.isOnline)
                FormError(message: error)
            }
        }
        .onAppear {
            guard let initial else {
                categoryId = categories.first?.id ?? ""
                return
            }
            nameFa = initial["nameFa"] as? String ?? ""
            nameEn = initial["nameEn"] as? String ?? ""
            description = (initial["description"] as? String) ?? ""
            if let v = initial["price"] as? Int { price = String(v) }
            categoryId = initial["categoryId"] as? String ?? ""
            isAvailable = initial["isAvailable"] as? Bool ?? true
            isFeatured = initial["isFeatured"] as? Bool ?? false
            allergenStatus = initial["allergenStatus"] as? String ?? "FREE"
            if let v = initial["prepBaseMin"] as? Int { prepBaseMin = String(v) }
            ingredientIds = initial["ingredientIds"] as? [String] ?? []
            allergenIds = initial["allergenIds"] as? [String] ?? []
            existingImages = (initial["images"] as? [[String: Any]] ?? []).map {
                ["url": $0["url"] ?? "", "isPrimary": $0["isPrimary"] ?? false]
            }
            existingImage = initial["image"] as? String
            existingCoffeeLines = (initial["coffeeLines"] as? [[String: Any]] ?? []).map {
                ["coffeeLineId": $0["coffeeLineId"] ?? "", "price": $0["price"] ?? 0, "isActive": $0["isActive"] ?? true]
            }
            existingIngredientQuantities = initial["ingredientQuantities"] as? [[String: Any]] ?? []
        }
    }
}

// MARK: Tables (number on create; label/active/occupied on edit)

struct TableFormView: View {
    @EnvironmentObject private var store: FarmanStore
    @Environment(\.dismiss) private var dismiss
    let recordId: String?
    let initial: [String: Any]?
    @State private var number = ""
    @State private var label = ""
    @State private var isActive = true
    @State private var isOccupied = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        FormContainer(title: recordId != nil ? "ویرایش میز" : "میز جدید") {
            Section("مشخصات") {
                if recordId == nil {
                    TextField("شماره میز", text: $number)
                }
                TextField("برچسب (اختیاری)", text: $label)
                Toggle("فعال", isOn: $isActive)
                if recordId != nil {
                    Toggle("اشغال", isOn: $isOccupied)
                }
            }
            Section {
                Button {
                    saving = true
                    Task {
                        do {
                            if let recordId {
                                let clean = label.trimmingCharacters(in: .whitespaces)
                                try await store.updateTable(id: recordId, payload: [
                                    "label": clean.isEmpty ? NSNull() : clean,
                                    "isActive": isActive,
                                    "isOccupied": isOccupied
                                ])
                            } else {
                                guard !number.trimmingCharacters(in: .whitespaces).isEmpty else {
                                    throw APIError(message: "شماره میز الزامی است")
                                }
                                let clean = label.trimmingCharacters(in: .whitespaces)
                                var payload: [String: Any] = ["number": number.trimmingCharacters(in: .whitespaces)]
                                if !clean.isEmpty { payload["label"] = clean }
                                try await store.createTable(payload: payload)
                            }
                            dismiss()
                        } catch {
                            self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                        }
                        saving = false
                    }
                } label: {
                    HStack { if saving { ProgressView() }; Text("ذخیره").bold().frame(maxWidth: .infinity) }
                }.disabled(saving || !store.isOnline)
                FormError(message: error)
            }
        }
        .onAppear {
            guard let initial else { return }
            number = initial["number"] as? String ?? ""
            label = initial["label"] as? String ?? ""
            isActive = initial["isActive"] as? Bool ?? true
            isOccupied = initial["isOccupied"] as? Bool ?? false
        }
    }
}

// MARK: Staff pay — rates, history, Tehran estimates (owner only)

struct StaffPayListView: View {
    @EnvironmentObject private var store: FarmanStore
    private var rows: [ManagementRecord] { store.management["pay"] ?? [] }
    var body: some View {
        VStack(spacing: 10) {
            if rows.isEmpty {
                EmptyInline(text: store.isOnline ? "پرسنلی ثبت نشده است" : "داده ذخیره‌شده‌ای وجود ندارد")
            }
            ForEach(rows) { row in
                NavigationLink(destination: StaffPayDetailView(staffId: row.id, staffName: row.title)) {
                    HStack(spacing: 12) {
                        Image(systemName: "banknote.fill").foregroundColor(FarmanTheme.wine).frame(width: 42, height: 42).background(FarmanTheme.wine.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 11))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(row.title).font(.headline)
                            Text(row.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary)
                            if let value = row.value { Text(value).font(.caption.bold()) }
                        }
                        Spacer()
                        if let status = row.status { Text(status).font(.caption2.bold()).foregroundColor(FarmanTheme.wine).padding(7).background(FarmanTheme.wine.opacity(0.12)).clipShape(Capsule()) }
                        Image(systemName: "chevron.left").font(.caption).foregroundColor(FarmanTheme.secondary)
                    }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
                }.buttonStyle(.plain).disabled(!store.isOnline)
            }
        }
    }
}

struct StaffPayDetailView: View {
    @EnvironmentObject private var store: FarmanStore
    let staffId: String
    let staffName: String
    @State private var overview: PayOverview?
    @State private var estimate: PayEstimateResponse?
    @State private var fromDate = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var toDate = Date()
    @State private var payType = "MONTHLY"
    @State private var amount = ""
    @State private var effectiveAt = Date()
    @State private var note = ""
    @State private var editingId: String?
    @State private var saving = false
    @State private var error: String?
    @State private var loading = true

    private var dateFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "Asia/Tehran")
        return f
    }

    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(spacing: 12) {
                    if loading && overview == nil {
                        ProgressView("در حال بارگذاری...").padding()
                    }
                    if let current = overview?.current {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("نرخ فعلی").font(.headline)
                            Text(current.payType == "HOURLY" ? "\(faNumber(current.amount)) تومان/ساعت" : "\(faNumber(current.amount)) تومان/ماه").font(.subheadline.bold())
                            if let preview = overview?.currentHourlyPreview, current.payType == "MONTHLY" {
                                Text("معادل ساعتی ≈ \(faNumber(preview)) تومان (÷ ۲۲۰ ساعت)").font(.caption).foregroundColor(FarmanTheme.secondary)
                            }
                            Text("اضافه‌کاری با همین نرخ پرداخت و جداگانه گزارش می‌شود.").font(.caption).foregroundColor(FarmanTheme.secondary)
                        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(editingId != nil ? "ویرایش نرخ آینده" : "ثبت نرخ جدید").font(.headline)
                        Picker("نوع", selection: $payType) {
                            Text("ماهانه (تومان)").tag("MONTHLY"); Text("ساعتی (تومان)").tag("HOURLY")
                        }.pickerStyle(.segmented).padding(.vertical, 4)
                        Text("مبلغ دستمزد").font(.caption.bold()).foregroundColor(FarmanTheme.secondary)
                        HStack(spacing: 8) {
                            Image(systemName: "banknote").foregroundColor(FarmanTheme.olive)
                            TextField("مثلاً ۱۲٬۰۰۰٬۰۰۰", text: $amount)
                                .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                            Text("تومان").font(.caption.bold()).foregroundColor(FarmanTheme.secondary)
                        }.padding(14).background(FarmanTheme.raised).clipShape(RoundedRectangle(cornerRadius: 12))
                        DatePicker("تاریخ شروع نرخ", selection: $effectiveAt)
                            .padding(12).background(FarmanTheme.raised).clipShape(RoundedRectangle(cornerRadius: 12))
                        TextField("یادداشت (اختیاری)", text: $note)
                            .padding(14).background(FarmanTheme.raised).clipShape(RoundedRectangle(cornerRadius: 12))
                        Button {
                            saving = true
                            Task {
                                do {
                                    guard let value = parseLocalizedInt(amount), value > 0 else {
                                        throw APIError(message: "مبلغ حقوق باید عدد صحیح مثبت باشد (تومان)")
                                    }
                                    var payload: [String: Any] = ["payType": payType, "amount": value, "effectiveAt": isoString(effectiveAt)]
                                    let clean = note.trimmingCharacters(in: .whitespaces)
                                    if !clean.isEmpty { payload["note"] = clean }
                                    try await store.savePayRate(staffId: staffId, rateId: editingId, payload: payload)
                                    amount = ""; note = ""; editingId = nil
                                    await reload()
                                } catch {
                                    self.error = (error as? LocalizedError)?.errorDescription ?? "ذخیره انجام نشد."
                                }
                                saving = false
                            }
                        } label: {
                            HStack { if saving { ProgressView() }; Text(editingId != nil ? "به‌روزرسانی" : "ثبت نرخ").bold().frame(maxWidth: .infinity) }
                        }
                        .buttonStyle(.plain).padding(12).background(FarmanTheme.olive).foregroundColor(FarmanTheme.background).clipShape(RoundedRectangle(cornerRadius: 12))
                        .disabled(saving || !store.isOnline)
                        FormError(message: error)
                    }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
                    if let estimate {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("تخمین دستمزد (Asia/Tehran)").font(.headline)
                            DatePicker("از", selection: $fromDate, displayedComponents: .date)
                                .onChange(of: fromDate) { _ in Task { await reloadEstimate() } }
                            DatePicker("تا", selection: $toDate, displayedComponents: .date)
                                .onChange(of: toDate) { _ in Task { await reloadEstimate() } }
                            HStack {
                                Text("عادی: \(faNumber(estimate.summary.totalWorkedMin / 60)) ساعت").font(.caption)
                                Spacer()
                                Text("اضافه‌کار: \(faNumber(estimate.summary.totalOvertimeMin / 60)) ساعت").font(.caption)
                            }
                            Text("جمع برآورد: \(money(Double(estimate.summary.totalPay)))").font(.subheadline.bold())
                            Text("\(faNumber(estimate.summary.dayCount)) روز دارای حاضری").font(.caption).foregroundColor(FarmanTheme.secondary)
                            ForEach(estimate.days.prefix(14)) { day in
                                HStack {
                                    Text(day.date).font(.caption2).foregroundColor(FarmanTheme.secondary)
                                    Spacer()
                                    Text("عادی \(faNumber(day.estimate.regularMin))′ • اضافه \(faNumber(day.estimate.overtimeMin))′").font(.caption2)
                                }
                            }
                        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
                    }
                    if let overview, !overview.rates.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("تاریخچه نرخ‌ها").font(.headline)
                            ForEach(overview.rates, id: \.id) { rate in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(rate.payType == "HOURLY" ? "\(faNumber(rate.amount)) تومان/ساعت" : "\(faNumber(rate.amount)) تومان/ماه").font(.caption.bold())
                                        Text(rate.effectiveAt.prefix(10)).font(.caption2).foregroundColor(FarmanTheme.secondary)
                                        if let note = rate.note { Text(note).font(.caption2).foregroundColor(FarmanTheme.secondary) }
                                    }
                                    Spacer()
                                    if overview.editableIds.contains(rate.id) {
                                        Button("ویرایش") {
                                            editingId = rate.id
                                            payType = rate.payType
                                            amount = String(rate.amount)
                                            effectiveAt = isoDate(rate.effectiveAt)
                                            note = rate.note ?? ""
                                        }.font(.caption.bold())
                                        Button("حذف", role: .destructive) {
                                            Task {
                                                do {
                                                    try await store.deletePayRate(staffId: staffId, rateId: rate.id)
                                                    await reload()
                                                } catch {
                                                    self.error = (error as? LocalizedError)?.errorDescription ?? "حذف انجام نشد."
                                                }
                                            }
                                        }.font(.caption.bold())
                                    } else {
                                        Text("فقط خواندنی").font(.caption2).foregroundColor(FarmanTheme.secondary)
                                    }
                                }.padding(.vertical, 4)
                                Divider().background(FarmanTheme.border)
                            }
                        }.padding(14).cardStyle().foregroundColor(FarmanTheme.text)
                    }
                    SyncFooter()
                }.padding(16)
            }
        }
        .navigationTitle("دستمزد \(staffName)")
        .task { await reload() }
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            overview = try await store.fetchPay(staffId: staffId)
            await reloadEstimate()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "بارگذاری انجام نشد."
        }
    }

    private func reloadEstimate() async {
        do {
            estimate = try await store.fetchPayEstimate(staffId: staffId, from: dateFormatter.string(from: fromDate), to: dateFormatter.string(from: toDate))
        } catch {
            // Estimate stays empty offline; rates above remain readable from cache rules.
        }
    }
}

// MARK: - Assistant and more

struct ChatMessage: Identifiable, Codable, Equatable { var id = UUID(); let text: String; let isUser: Bool }

struct ChatTranscript: Identifiable, Codable {
    var id = UUID()
    let date: Date
    let messages: [ChatMessage]
}

struct AssistantView: View {
    @EnvironmentObject var store: FarmanStore
    @Binding var selectedTab: Int
    @State private var question = ""
    @State private var messages: [ChatMessage] = [ChatMessage(text: "سلام! درباره فروش، موجودی یا عملیات کافه از من بپرس.", isUser: false)]
    @State private var history: [ChatTranscript] = []
    @State private var showingHistory = false
    @State private var sending = false

    var body: some View {
        ScreenBackground {
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        HStack {
                            Button { selectedTab = 0 } label: { Image(systemName: "xmark").font(.title3).frame(width: 42, height: 42).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12)) }.accessibilityLabel("خروج از دستیار")
                            Button { showingHistory = true } label: { Image(systemName: "clock.arrow.circlepath").font(.title2).frame(width: 46, height: 46).background(FarmanTheme.surface).clipShape(RoundedRectangle(cornerRadius: 14)) }.accessibilityLabel("تاریخچه گفتگوها")
                            Spacer()
                            VStack(spacing: 5) { Text("دستیار Cafe 13").font(.system(size: 28, weight: .black, design: .rounded)); Label(store.isOnline ? "اطلاعات شما امن است" : "حالت آفلاین", systemImage: "lock.fill").font(.caption).foregroundColor(store.isOnline ? FarmanTheme.olive : FarmanTheme.wine) }
                            Spacer()
                            Image(systemName: "cup.and.saucer.fill").font(.title2).foregroundColor(.white).frame(width: 52, height: 52).background(FarmanTheme.raised).clipShape(Circle()).overlay(Circle().stroke(FarmanTheme.border))
                        }
                        Text("امروز • Cafe 13").font(.subheadline).padding(.horizontal, 24).padding(.vertical, 10).background(FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border))
                        if messages.count > 1 { Button("گفتگوی جدید") { archiveConversation() }.font(.caption.bold()).foregroundColor(FarmanTheme.olive) }
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
                    TextField("از دستیار بپرس…", text: $question).padding(14).background(FarmanTheme.surface).clipShape(Capsule()).overlay(Capsule().stroke(FarmanTheme.border))
                    Button { send(question) } label: { Image(systemName: "paperplane.fill").font(.headline).frame(width: 48, height: 48).background(FarmanTheme.wine).foregroundColor(.white).clipShape(Circle()) }.disabled(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending || !store.isOnline)
                }.padding(14).overlay(Divider().background(FarmanTheme.border), alignment: .top)
            }.foregroundColor(FarmanTheme.text)
        }.navigationBarHidden(true)
            .sheet(isPresented: $showingHistory) {
                NavigationView {
                    List {
                        if messages.count > 1 {
                            Button("گفتگوی جاری") { showingHistory = false }
                        }
                        ForEach(history) { chat in
                            Button {
                                messages = chat.messages
                                showingHistory = false
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(chat.messages.first(where: { $0.isUser })?.text ?? "گفتگو").lineLimit(1)
                                    Text(chat.date, style: .date).font(.caption)
                                }
                            }
                        }
                    }
                    .navigationTitle("تاریخچه گفتگوها")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("بستن") { showingHistory = false } } }
                }
            }
            .onAppear {
                history = (try? JSONDecoder().decode([ChatTranscript].self, from: UserDefaults.standard.data(forKey: "farman-chat-history") ?? Data())) ?? []
                if let saved = try? JSONDecoder().decode([ChatMessage].self, from: UserDefaults.standard.data(forKey: "farman-chat-current") ?? Data()), !saved.isEmpty { messages = saved }
            }
            .onChange(of: messages) { updated in UserDefaults.standard.set(try? JSONEncoder().encode(updated), forKey: "farman-chat-current") }
    }

    private func archiveConversation() {
        if messages.count > 1 {
            history.insert(ChatTranscript(date: Date(), messages: messages), at: 0)
            history = Array(history.prefix(50))
            UserDefaults.standard.set(try? JSONEncoder().encode(history), forKey: "farman-chat-history")
        }
        messages = [ChatMessage(text: "سلام! درباره فروش، موجودی یا عملیات کافه از من بپرس.", isUser: false)]
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

struct SettingsTabView: View {
    @EnvironmentObject var store: FarmanStore
    var body: some View {
        ScreenBackground {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    HeaderView(title: "تنظیمات", subtitle: "حساب، اتصال و همگام‌سازی")
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill").font(.system(size: 44)).foregroundColor(FarmanTheme.olive)
                        VStack(alignment: .leading) { Text(store.user?.name ?? "مدیر").fontWeight(.bold); Text(store.user?.email ?? "حساب ذخیره‌شده").font(.caption).foregroundColor(FarmanTheme.secondary) }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(16).cardStyle()
                    NativeSettingsView()
                    if let date = store.lastSync {
                        HStack { Text("آخرین همگام‌سازی"); Spacer(); Text(date, style: .relative) }
                            .font(.caption).foregroundColor(FarmanTheme.secondary)
                    }
                    Button(role: .destructive) { store.logout() } label: {
                        Label("خروج از حساب", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity).padding(12)
                    }.buttonStyle(.bordered)
                }
                .padding(16)
            }
        }.navigationBarHidden(true)
    }
}

// MARK: - Native management tools

struct SalesFlowNativeView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var range = "today"
    @State private var summary: [String: Any] = [:]
    @State private var intervals: [[String: Any]] = []
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("بازه", selection: $range) {
                Text("امروز").tag("today"); Text("دیروز").tag("yesterday"); Text("هفته").tag("week"); Text("ماه").tag("month")
            }.pickerStyle(.segmented)
            HStack {
                Label("\(faNumber((summary["totalOrders"] as? Int) ?? 0)) سفارش", systemImage: "bag.fill")
                Spacer()
                Text(money((summary["totalRevenue"] as? NSNumber)?.doubleValue ?? 0)).bold()
            }.padding(14).cardStyle()
            ForEach(Array(intervals.enumerated()), id: \.offset) { _, item in
                HStack {
                    Text(item["label"] as? String ?? "بازه")
                    Spacer()
                    Text("\(faNumber(item["orders"] as? Int ?? 0)) سفارش")
                    Text(money((item["revenue"] as? NSNumber)?.doubleValue ?? 0)).bold()
                }.font(.caption).padding(12).cardStyle()
            }
            FormError(message: error)
        }
        .task(id: range) {
            do {
                let data = try await store.readJSON(path: "/api/admin/sales-flow/data?range=\(range)")
                summary = data["summary"] as? [String: Any] ?? [:]
                intervals = (data["intervals"] as? [[String: Any]] ?? []).filter { ($0["orders"] as? Int ?? 0) > 0 }
                error = nil
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct CashierAccessView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var available: [(String, String)] = []
    @State private var enabled: Set<String> = []
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("تب‌های قابل استفاده صندوق‌دار").font(.headline)
            ForEach(available, id: \.0) { item in
                Toggle(item.1, isOn: Binding(get: { enabled.contains(item.0) }, set: { value in
                    if value { enabled.insert(item.0) } else { enabled.remove(item.0) }
                })).tint(FarmanTheme.olive)
            }
            Button("ذخیره دسترسی‌ها") {
                Task {
                    do {
                        _ = try await store.apiJSON(path: "/api/admin/cashier-access", method: "PUT", payload: ["tabs": available.map(\.0).filter { enabled.contains($0) }])
                        error = nil
                    } catch { self.error = error.localizedDescription }
                }
            }.buttonStyle(.borderedProminent).disabled(!store.isOnline)
            FormError(message: error)
        }.padding(16).cardStyle()
            .task {
                do {
                    let data = try await store.readJSON(path: "/api/admin/cashier-access")
                    available = (data["available"] as? [[String: Any]] ?? []).compactMap { row in
                        guard let id = row["id"] as? String, let label = row["label"] as? String else { return nil }
                        return (id, label)
                    }
                    enabled = Set(data["tabs"] as? [String] ?? [])
                } catch { self.error = error.localizedDescription }
            }
    }
}

struct NativeSettingsView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var serverText = FarmanStore.server.absoluteString
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("اتصال و همگام‌سازی").font(.headline)
            TextField("آدرس سرور", text: $serverText).textInputAutocapitalization(.never).keyboardType(.URL)
                .padding(12).background(FarmanTheme.raised).clipShape(RoundedRectangle(cornerRadius: 10))
            Button("ذخیره و بررسی اتصال") {
                FarmanStore.saveServer(serverText)
                Task { await store.pingServerThenBootstrap() }
            }.buttonStyle(.borderedProminent)
            Button("همگام‌سازی اکنون") { Task { await store.refreshQuietly() } }.buttonStyle(.bordered)
            Text("همگام‌سازی خودکار هر ۱۰ ثانیه هنگام باز بودن اپ انجام می‌شود.").font(.caption).foregroundColor(FarmanTheme.secondary)
            Text(store.isOnline ? "سرور متصل است" : "حالت آفلاین؛ اطلاعات ذخیره‌شده خواندنی است").font(.caption)
        }.padding(16).cardStyle()
        ForEach(store.management["settings"] ?? []) { row in
            VStack(alignment: .leading, spacing: 4) {
                Text(row.title).font(.caption.bold())
                Text(row.subtitle).font(.caption).foregroundColor(FarmanTheme.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(12).cardStyle()
        }
    }
}

struct AllergenCreateView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var key = ""
    @State private var nameFa = ""
    @State private var nameEn = ""
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("افزودن آلرژن").font(.headline)
            TextField("کلید انگلیسی", text: $key).textInputAutocapitalization(.never)
            TextField("نام فارسی", text: $nameFa)
            TextField("نام انگلیسی", text: $nameEn).textInputAutocapitalization(.never)
            Button("ثبت آلرژن") {
                Task {
                    do {
                        _ = try await store.apiJSON(path: "/api/admin/allergens", method: "POST", payload: ["key": key, "nameFa": nameFa, "nameEn": nameEn])
                        key = ""; nameFa = ""; nameEn = ""; error = nil
                    } catch { self.error = error.localizedDescription }
                }
            }.buttonStyle(.borderedProminent).disabled(!store.isOnline || key.isEmpty || nameFa.isEmpty || nameEn.isEmpty)
            FormError(message: error)
        }.textFieldStyle(.roundedBorder).padding(16).cardStyle()
    }
}

struct AllergenCard: View {
    @EnvironmentObject private var store: FarmanStore
    let record: ManagementRecord
    @State private var error: String?
    var body: some View {
        HStack {
            VStack(alignment: .leading) { Text(record.title).bold(); Text(record.subtitle).font(.caption) }
            Spacer()
            if store.isOwner {
                Button("حذف", role: .destructive) {
                    Task {
                        do { _ = try await store.apiJSON(path: "/api/admin/allergens/\(record.id)", method: "DELETE") }
                        catch { self.error = error.localizedDescription }
                    }
                }.disabled(!store.isOnline)
            }
        }.padding(14).cardStyle().alert("خطا", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("باشه") { error = nil } } message: { Text(error ?? "") }
    }
}

struct CustomerLoyaltyCard: View {
    @EnvironmentObject private var store: FarmanStore
    let record: ManagementRecord
    @State private var amount = "1"
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(record.title).bold()
            Text(record.subtitle).font(.caption)
            if let value = record.value { Text(value).foregroundColor(FarmanTheme.olive) }
            HStack {
                TextField("امتیاز", text: $amount).keyboardType(.numberPad).frame(width: 90)
                Button("افزودن امتیاز") {
                    Task {
                        do {
                            guard let points = parseLocalizedInt(amount), (1...10000).contains(points) else { throw APIError(message: "امتیاز باید بین ۱ تا ۱۰٬۰۰۰ باشد") }
                            _ = try await store.apiJSON(path: "/api/admin/customers/\(record.id)/points", method: "POST", payload: ["amount": points])
                            error = nil
                        } catch { self.error = error.localizedDescription }
                    }
                }.buttonStyle(.bordered).disabled(!store.isOnline)
            }
            FormError(message: error)
        }.padding(14).cardStyle()
    }
}

struct QRManagementView: View {
    @EnvironmentObject private var store: FarmanStore
    @State private var label = ""
    @State private var tableNumber = ""
    @State private var error: String?
    var body: some View {
        VStack(spacing: 12) {
            if store.isOwner {
                VStack(alignment: .leading, spacing: 8) {
                    Text("کد QR جدید").font(.headline)
                    TextField("عنوان", text: $label)
                    TextField("شماره میز (اختیاری)", text: $tableNumber)
                    Button("ایجاد کد") {
                        Task {
                            do {
                                _ = try await store.apiJSON(path: "/api/admin/qr", method: "POST", payload: ["label": label, "tableNumber": tableNumber.isEmpty ? NSNull() : tableNumber])
                                label = ""; tableNumber = ""; error = nil
                            } catch { self.error = error.localizedDescription }
                        }
                    }.buttonStyle(.borderedProminent).disabled(!store.isOnline)
                    FormError(message: error)
                }.textFieldStyle(.roundedBorder).padding(14).cardStyle()
            }
            ForEach(store.management["qr"] ?? []) { record in QRCodeCard(record: record) }
        }
    }
}

struct QRCodeCard: View {
    @EnvironmentObject private var store: FarmanStore
    let record: ManagementRecord
    private var url: URL? {
        guard let code = record.value, !code.isEmpty else { return nil }
        return URL(string: "\(FarmanStore.server.absoluteString)/?table=\(code)")
    }
    private var image: UIImage? {
        guard let url else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        guard let ciImage = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cgImage = CIContext().createCGImage(ciImage, from: ciImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
    var body: some View {
        VStack(spacing: 8) {
            if let image { Image(uiImage: image).interpolation(.none).resizable().frame(width: 180, height: 180).padding(12).background(.white).clipShape(RoundedRectangle(cornerRadius: 12)) }
            Text(record.title).bold()
            Text(record.subtitle).font(.caption)
            if let url {
                Text(url.absoluteString).font(.caption2).textSelection(.enabled)
                HStack {
                    Button { UIPasteboard.general.url = url } label: { Label("کپی لینک", systemImage: "doc.on.doc") }
                    Button { if let image { let printer = UIPrintInteractionController.shared; printer.printingItem = image; printer.present(animated: true) } } label: { Label("چاپ", systemImage: "printer") }
                }.buttonStyle(.bordered)
            }
        }.frame(maxWidth: .infinity).padding(14).cardStyle()
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

func parseLocalizedInt(_ value: String) -> Int? {
    let persian = Array("۰۱۲۳۴۵۶۷۸۹")
    let arabic = Array("٠١٢٣٤٥٦٧٨٩")
    let ascii = value.compactMap { character -> Character? in
        if let index = persian.firstIndex(of: character) { return Character(String(index)) }
        if let index = arabic.firstIndex(of: character) { return Character(String(index)) }
        return character == "," || character == "٬" || character.isWhitespace ? nil : character
    }
    return Int(String(ascii))
}

func statusTitle(_ value: String) -> String {
    ["PENDING": "در انتظار", "CONFIRMED": "تأیید", "PREPARING": "در حال آماده‌سازی", "READY": "آماده", "READY_TO_SERVE": "آماده سرو", "COMPLETED": "تکمیل", "CANCELLED": "لغو", "APPROVED": "تأیید شد", "REJECTED": "رد شد"][value] ?? value
}
