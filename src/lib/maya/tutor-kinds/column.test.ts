import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { OperationPackage } from "@/lib/question-package";
import { columnKind } from "./column";
import { describeTutorKind } from "./contract";

describeTutorKind(columnKind, [SAMPLE_PACKAGES["subtract-52-28"], SAMPLE_PACKAGES["add-27-39"]] as OperationPackage[]);
