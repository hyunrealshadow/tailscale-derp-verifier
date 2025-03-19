# tailscale-derp-verifier

According to the Tailscale OAuth client, the corresponding `nodekey` is authorized to pass the Tailscale `--verify-client-url` check.

Deploy this on Cloudflare Workers.

Note: Only the `nodekey` will be verified; IP addresses will not be checked.


## Usage

1. Copy the `wrangler.template.jsonc` to `wrangler.jsonc` and fill the kv namespace id.
2. Create a secret named `TAILSCALE_OAUTH_APPS`, which is a JSON string containing the organization name and the oauth client id and secret.
    Example:
    ```json
    [
      {
        "organizationName": "xxx",
        "clientId": "xxx",
        "clientSecret": "xxx"
      }
    ]
    ```
3. Run `wrangler publish` to deploy the worker.

## Liecnse

[Apache 2.0](LICENSE)
