import { createMiddleware, createStart } from "@tanstack/react-start";

const securityHeaders = createMiddleware().server(async ({ next }) => {
	const result = await next();

	const headers = result.response.headers;
	headers.set("X-Frame-Options", "DENY");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set(
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=()",
	);
	headers.set(
		"Strict-Transport-Security",
		"max-age=63072000; includeSubDomains; preload",
	);
	headers.set(
		"Content-Security-Policy",
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
			"font-src 'self' https://fonts.gstatic.com",
			"img-src 'self' data:",
			"connect-src 'self' https://code-api.stoff.dev wss://maincloud.spacetimedb.com",
		].join("; "),
	);

	return result;
});

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeaders],
}));
