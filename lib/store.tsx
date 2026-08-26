"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import type { Decision } from "./types";
import type { DemoState } from "./views";

export interface ChatJob {
  id: string;
  title: string;
  stages: string[];
  needsApproval: boolean;
  amount?: number;
  policyNote?: string;
}

interface JobState {
  jobs: ChatJob[];
  nextIndex: number;
}

export interface SessionUser {
  id: string;
  name: string;
  title: string;
  roleId: string;
  approvalLimit: number;
}

type Action =
  | { type: "decide"; decision: Exclude<Decision, "pending"> }
  | { type: "add_job"; job: Omit<ChatJob, "id">; id: string }
  | { type: "reset" };

function reducer(
  state: DemoState & JobState,
  action: Action,
): DemoState & JobState {
  switch (action.type) {
    case "decide":
      return { ...state, decision: action.decision };
    case "add_job":
      return {
        ...state,
        jobs: [...state.jobs, { ...action.job, id: action.id }],
        nextIndex: state.nextIndex + 1,
      };
    case "reset":
      return { decision: "pending", jobs: [], nextIndex: 0 };
    default:
      return state;
  }
}

interface DemoContextValue extends DemoState, JobState {
  user: SessionUser | null;
  decide: (decision: Exclude<Decision, "pending">) => void;
  addJob: (job: Omit<ChatJob, "id">) => string;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

let jobCounter = 0;

export function DemoProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [state, dispatch] = useReducer(reducer, {
    decision: "pending" as Decision,
    jobs: [] as ChatJob[],
    nextIndex: 0,
  });
  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      user: initialUser,
      decide: (decision) => dispatch({ type: "decide", decision }),
      addJob: (job) => {
        // Stable-enough id for a single-tab demo session.
        const id = `wf-chat-${++jobCounter}`;
        dispatch({ type: "add_job", job, id });
        return id;
      },
      reset: () => {
        jobCounter = 0;
        dispatch({ type: "reset" });
      },
    }),
    [state, initialUser],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
