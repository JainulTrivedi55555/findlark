// Any /api path we do not have: a JSON 404 in the usual { error, message } shape
// instead of the HTML not-found page. Real routes are more specific, so they win.
const notFound = () => Response.json({ error: 'not_found', message: 'No such API route.' }, { status: 404 });

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
