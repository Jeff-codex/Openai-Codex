const ROBOTS_TXT = `User-agent: Googlebot
Allow: /
Disallow: /api/
Disallow: /functions/
Disallow: /01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%ED%9A%8C%EC%9B%90%EC%A0%84%EC%9A%A9%ED%8E%98%EC%9D%B4%EC%A7%80-MemberPortal/
Disallow: /01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%EA%B4%80%EB%A6%AC%EC%9E%90%ED%8E%98%EC%9D%B4%EC%A7%80-AdminPage/

User-agent: Yeti
Allow: /
Disallow: /api/
Disallow: /functions/
Disallow: /01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%ED%9A%8C%EC%9B%90%EC%A0%84%EC%9A%A9%ED%8E%98%EC%9D%B4%EC%A7%80-MemberPortal/
Disallow: /01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%EA%B4%80%EB%A6%AC%EC%9E%90%ED%8E%98%EC%9D%B4%EC%A7%80-AdminPage/

Sitemap: https://dliver.co.kr/sitemap.xml
`;

export async function onRequest(context) {
  const method = String(context.request.method || "GET").toUpperCase();
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }
  if (method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return new Response(ROBOTS_TXT, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
