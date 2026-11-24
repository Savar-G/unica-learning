// The one Typst and the fonts that draw a book. Another version or another byte in a font can change a printed page, so
// each is pinned by its SHA-256 and checked before every use. The archives are the official ones from the Typst release.
export interface Pins {
  version: string;
  targets: Readonly<Record<string, { archiveSha256: string; programSha256: string }>>;
  fonts: Readonly<Record<string, string>>;
}

export const PINS: Pins = {
  version: "0.15.1",
  targets: {
    "aarch64-apple-darwin": {
      archiveSha256: "48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a",
      programSha256: "7c4a136b377f3689400afe37b4f0fe3528d50faaa55cbb1106ac8a128f86ba1a",
    },
    "x86_64-apple-darwin": {
      archiveSha256: "7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa",
      programSha256: "a6fb5786e71f6f95d8323b326353770734c1e4624e7c108783ea578723916b46",
    },
    "x86_64-unknown-linux-musl": {
      archiveSha256: "a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c",
      programSha256: "29273eaa04f6d00edd0c2bec578f565fc9c65be856bfbffc894567c68ed0b237",
    },
    "aarch64-unknown-linux-musl": {
      archiveSha256: "5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee",
      programSha256: "3088dd985a891d804a98c69db24dfca77a35878e45d40e38c79cf36d72bcd4c1",
    },
  },
  fonts: {
    "Geist-Regular.ttf": "2c460a7a71063e53491f343d44b382267bc0cf496e31db64865f962af3152e68",
    "Geist-SemiBold.ttf": "01923aa148e5202ae70a2e11b2ab4dc41b80bcc374aedccc913d47bb2f591c06",
  },
};
