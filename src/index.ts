/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface TailscaleOAuthApp {
	organizationName: string;
	clientId: string;
	clientSecret: string;
}

interface OAuthTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

interface TailscaleDevice {
	addresses: string[];
	authorized: boolean;
	blocksIncomingConnections: boolean;
	clientVersion: string;
	created: string;
	expires: string;
	hostname: string;
	id: string;
	isExternal: boolean;
	keyExpiryDisabled: boolean;
	lastSeen: string;
	machineKey: string;
	name: string;
	nodeId: string;
	nodeKey: string;
	os: string;
	tailnetLockError: string;
	tailnetLockKey: string;
	updateAvailable: boolean;
	user: string;
}

interface TailscaleDevicesResponse {
	devices: TailscaleDevice[];
}

interface DERPAdmitClientRequest {
	NodePublic: string;
	Source: string;
}

interface DERPAdmitClientResponse {
	Allow: boolean;
}

const OAUTH_TOKEN_URL = 'https://api.tailscale.com/api/v2/oauth/token';
const OAUTH_SCOPE = 'devices:core:read';

async function oAuthToken(oAuthApp: TailscaleOAuthApp) {
	const { clientId, clientSecret } = oAuthApp;
	const response = await fetch(OAUTH_TOKEN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: `client_id=${clientId}&client_secret=${clientSecret}&scope=${OAUTH_SCOPE}&grant_type=client_credentials`,
	});
	if (response.ok) {
		const data = await response.json<OAuthTokenResponse>();
		return data.access_token;
	} else {
		throw new Error(`Failed to get OAuth token: ${response.status} ${response.statusText}`);
	}
}

async function tailscaleDevices(token: string, organizationName: string) {
	const response = await fetch(`https://api.tailscale.com/api/v2/tailnet/${organizationName}/devices`, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
	if (response.ok) {
		const data = await response.json<TailscaleDevicesResponse>();
		return data.devices;
	} else {
		throw new Error(`Failed to get devices: ${response.status} ${response.statusText}`);
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const method = request.method.toUpperCase();
		if (method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}
		const body = await request.json<DERPAdmitClientRequest>();
		if (!body) {
			return new Response('Bad Request', { status: 400 });
		}
		const { NodePublic, Source } = body;
		if (!NodePublic || !Source) {
			return new Response('Bad Request', { status: 400 });
		}

		let syncTime = await env.KV.get('syncTime', { type: 'text' });
		let nodeKeys = (await env.KV.get('nodeKeys', { type: 'json' })) as string[] | null;

		if (!syncTime || Date.now() - new Date(syncTime).getTime() > 60 * 60 * 1000) {
			syncTime = new Date().toISOString();
			await env.KV.put('syncTime', syncTime);

			const tailscaleOAuthApps = JSON.parse(env.TAILSCALE_OAUTH_APPS) as TailscaleOAuthApp[];
			const devicePromises = tailscaleOAuthApps.map(async (app) => {
				const token = await oAuthToken(app);
				const devices = await tailscaleDevices(token, app.organizationName);
				return devices.map(device => device.nodeKey).filter((key): key is string => !!key);
			});
			const allNodeKeys = await Promise.all(devicePromises);
			nodeKeys = allNodeKeys.flat();
			await env.KV.put('nodeKeys', JSON.stringify(nodeKeys));
		}

		const response: DERPAdmitClientResponse = {
			Allow: false,
		};

		if (nodeKeys && nodeKeys.includes(NodePublic)) {
			response.Allow = true;
		}

		return new Response(JSON.stringify(response), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
} satisfies ExportedHandler<Env>;
