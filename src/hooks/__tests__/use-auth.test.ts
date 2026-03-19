import { renderHook, act } from "@testing-library/react";
import { test, expect, vi, beforeEach, describe } from "vitest";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock server actions
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
}));

// Mock anon-work-tracker
const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

// Mock project actions
const mockGetProjects = vi.fn();
const mockCreateProject = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));
vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

import { useAuth } from "@/hooks/use-auth";

const anonWork = {
  messages: [{ role: "user", content: "hello" }],
  fileSystemData: { "/": {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" });
  mockSignIn.mockResolvedValue({ success: true });
  mockSignUp.mockResolvedValue({ success: true });
});

describe("useAuth — initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn and signUp functions", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});

describe("signIn", () => {
  test("calls signInAction with email and password", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });
    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "password123");
  });

  test("sets isLoading to true during request and false after", async () => {
    let resolveSignIn!: (v: unknown) => void;
    mockSignIn.mockReturnValue(new Promise((res) => (resolveSignIn = res)));
    mockGetAnonWorkData.mockReturnValue(null);

    const { result } = renderHook(() => useAuth());

    let signInPromise: Promise<unknown>;
    act(() => {
      signInPromise = result.current.signIn("user@example.com", "pass");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false, error: "bad creds" });
      await signInPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("returns the result from signInAction", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });
    const { result } = renderHook(() => useAuth());

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signIn("bad@example.com", "wrong");
    });

    expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
  });

  test("does not navigate when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("bad@example.com", "wrong");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("resets isLoading to false even when signInAction throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "pass").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("signUp", () => {
  test("calls signUpAction with email and password", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });
    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
  });

  test("returns the result from signUpAction", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });
    const { result } = renderHook(() => useAuth());

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.signUp("taken@example.com", "pass1234");
    });

    expect(returnValue).toEqual({ success: false, error: "Email already registered" });
  });

  test("does not navigate when signUp fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("taken@example.com", "pass1234");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("resets isLoading to false even when signUpAction throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("user@example.com", "pass").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("post sign-in redirect — with anonymous work", () => {
  test("creates a project from anon work and navigates to it", async () => {
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "anon-project-id" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
  });

  test("does not call getProjects when anon work exists", async () => {
    mockGetAnonWorkData.mockReturnValue(anonWork);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("skips anon work migration when messages array is empty", async () => {
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-id" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-id");
  });

  test("skips anon work migration when getAnonWorkData returns null", async () => {
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "existing-id" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-id");
  });
});

describe("post sign-in redirect — no anonymous work", () => {
  test("navigates to the most recent existing project", async () => {
    mockGetProjects.mockResolvedValue([{ id: "project-1" }, { id: "project-2" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/project-1");
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  test("creates a new project and navigates to it when no projects exist", async () => {
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new-id" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new-id");
  });
});

describe("post sign-up redirect", () => {
  test("applies the same post-auth redirect logic after successful sign-up", async () => {
    mockGetAnonWorkData.mockReturnValue(anonWork);
    mockCreateProject.mockResolvedValue({ id: "signup-project-id" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/signup-project-id");
  });
});
