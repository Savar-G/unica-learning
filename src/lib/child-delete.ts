import { copyFamilyTests, type FamilyCopyStore } from "@/lib/assessment/anonymous-copy";
import { removeDeletionImages, type FamilyBucket, type FamilyDeletionStore } from "@/lib/assessment/deletion";

export interface ChildDeletionStore extends FamilyCopyStore, Pick<FamilyDeletionStore, "renew" | "listImages" | "removeImages"> {
  /** Exact child-owned folders from the frozen database rows. Never the parent folder. */
  roots(): Promise<{ bucket: FamilyBucket; prefix: string }[]>;
  /** Verifies all copies and empty folders again, then removes the child through the cascades. Keeps Auth and the parent. */
  complete(): Promise<void>;
}

/** The durable child fence and worker lease must already exist. Every step can resume after a lost answer. */
export async function deleteChild(store: ChildDeletionStore): Promise<{ images: number; copies: number }> {
  await store.renew();
  const copies = await copyFamilyTests(store);
  let images = 0;
  for (const root of await store.roots()) images += await removeDeletionImages(store, root.prefix, root.bucket);
  await store.renew();
  await store.complete();
  return { images, copies };
}
