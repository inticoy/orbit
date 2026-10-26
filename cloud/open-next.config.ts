import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request for the signed-in viewer, so no
// incremental cache (and no R2 bucket) is needed.
export default defineCloudflareConfig({});
