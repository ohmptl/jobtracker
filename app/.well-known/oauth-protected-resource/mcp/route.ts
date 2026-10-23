import { appOrigin } from "@/lib/tracker/security";
export function GET() {
  return Response.json(
    {
      resource: `${appOrigin()}/mcp`,
      authorization_servers: [
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
      ],
      bearer_methods_supported: ["header"],
      resource_name: "Job Tracker",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
