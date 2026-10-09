// Real Unica Learning photos (children learning at home, Unsplash licence), served from the live site.
// Use these instead of stock or AI images. URLs are content-hashed and stable while the image files are unchanged.
export const photos = {
  emotion10: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-10.1cjz17300tops.jpg",
  emotion11: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-11.342sa0uiyy07v.jpg",
  emotion4: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-4.20m1yghb5xmun.jpg",
  emotion5: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-5.0uv207c_-v7vz.jpg",
  emotion6: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-6.34_znewfbcx9e.jpg",
  emotion7: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-7.1y3pxrhq8ldwx.jpg",
  emotion9: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/emotion-9.2ty-l0f5uucod.jpg",
  heroHome1: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/hero-home-1.0qg36ivfoiysd.jpg",
  heroHome2: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/hero-home-2.3tgubey7x_yvy.jpg",
  loopAdapt3: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-adapt-3.0l8tkklk34dq2.jpg",
  loopAdapt4: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-adapt-4.41_r2tp42sj91.jpg",
  loopAssess1: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-assess-1.33t4i0uphn5nr.jpg",
  loopPractice6: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-practice-6.0imwnpuqd9vdk.jpg",
  loopPracticeReading1: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-practice-reading-1.0p9fahslbtsf4.jpg",
  loopPracticeReading2: "https://ai-workbooks-landing-page.vercel.app/_next/static/immutable/media/loop-practice-reading-2.34_znewfbcx9e.jpg",
} as const;

export type PhotoName = keyof typeof photos;
