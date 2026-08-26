import { promises as fs } from "fs";
import path from "path";
import { hashPassword, verifyPassword } from "./auth";
import { roles, users as seedUsers } from "./mock-data";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  title: string;
  approvalLimit: number;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
export const DEMO_PASSWORD = "demo1234";

async function loadUsers(): Promise<StoredUser[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { users?: StoredUser[] };
    if (Array.isArray(parsed.users)) return parsed.users;
  } catch {
    // first run — seed below
  }
  const seeded: StoredUser[] = seedUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: `${u.id.replace("u-", "")}@meridian.test`,
    passwordHash: hashPassword(DEMO_PASSWORD),
    roleId: u.roleId,
  }));
  await saveUsers(seeded);
  return seeded;
}

async function saveUsers(users: StoredUser[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    USERS_FILE,
    JSON.stringify({ users }, null, 2),
    "utf8",
  );
}

let cache: Promise<StoredUser[]> | null = null;

function all(): Promise<StoredUser[]> {
  if (!cache) cache = loadUsers();
  return cache;
}

function withRole(user: StoredUser): PublicUser {
  const role = roles.find((r) => r.id === user.roleId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    title: role?.title ?? "Team member",
    approvalLimit: role?.approvalLimit ?? 0,
  };
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await all();
  const target = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === target) ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  roleId: string;
}): Promise<PublicUser> {
  const users = await all();
  if (users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
    throw new Error("duplicate_email");
  }
  const stored: StoredUser = {
    id: `u-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: hashPassword(input.password),
    roleId: input.roleId,
  };
  users.push(stored);
  await saveUsers(users);
  return withRole(stored);
}

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return withRole(user);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const users = await all();
  const found = users.find((u) => u.id === id);
  return found ? withRole(found) : null;
}

export function isValidRoleId(roleId: string): boolean {
  return roles.some((r) => r.id === roleId);
}
