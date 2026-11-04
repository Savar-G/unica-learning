import { vi } from "vitest";
import { gradeWordCountCases } from "./word-count-cases";

vi.mock("server-only", () => ({}));

gradeWordCountCases(4);
