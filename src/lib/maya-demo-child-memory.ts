import type { DemoChild, DemoChildStore } from "@/lib/maya-demo-child";

// The demo child store (src/lib/maya-demo-child.ts, #323) in memory, for tests: families with their children and tests,
// the test families, and the marker rows of the children the script made.

export interface MemoryDemoFamilies {
  testFamilies: string[];
  children: (DemoChild & { parentId: string })[];
  tests?: { id: string; childId: string }[];
  marked?: string[];
}

export function memoryDemoChildStore(families: MemoryDemoFamilies): DemoChildStore & { state(): Required<MemoryDemoFamilies> } {
  const s: Required<MemoryDemoFamilies> = { tests: [], marked: [], ...structuredClone(families) };
  let n = 0;
  const plain = ({ id, firstName, grade, province }: DemoChild): DemoChild => ({ id, firstName, grade, province });
  return {
    isTestFamily: async (p) => s.testFamilies.includes(p),
    markedChild: async (p) => {
      const c = s.children.find((x) => x.parentId === p && s.marked.includes(x.id));
      return c ? plain(c) : null;
    },
    childrenNamed: async (p, name) => s.children.filter((x) => x.parentId === p && x.firstName === name).map(plain),
    createMarkedChild: async (p, name) => {
      const c = { id: `child-${++n}`, parentId: p, firstName: name, grade: 2, province: "BC" };
      s.children.push(c);
      s.marked.push(c.id);
      return plain(c);
    },
    rename: async (p, id, name) => {
      const c = s.children.find((x) => x.id === id && x.parentId === p);
      if (!c) throw new Error("no such child in the family");
      c.firstName = name;
    },
    tests: async (id) => s.tests.filter((t) => t.childId === id).map((t) => t.id),
    createTest: async (_p, childId) => {
      const id = `test-${++n}`;
      s.tests.push({ id, childId });
      return id;
    },
    state: () => structuredClone(s),
  };
}
