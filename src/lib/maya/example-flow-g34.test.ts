import { vi } from "vitest";
import { describeExampleFlowGrades } from "@/lib/maya/example-flow-harness";

vi.mock("server-only", () => ({}));

describeExampleFlowGrades([3, 4]);
