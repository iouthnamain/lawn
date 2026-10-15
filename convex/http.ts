import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/health", method: "GET", handler: httpAction(async () => new Response("OK")) });
export default http;
