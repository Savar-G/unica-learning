import { Button } from "ai-workbooks-landing-page";

export const Primary = () => <Button>Get started</Button>;
export const Ghost = () => <Button variant="ghost">See how it works</Button>;
export const Small = () => <Button size="sm" arrow={false}>Get started</Button>;
export const AsLink = () => <Button variant="ghost" href="#price" arrow={false}>See pricing</Button>;
