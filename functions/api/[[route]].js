export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  
  // Remove 'api' from the path segments if it's the first segment
  if (pathSegments[0] === 'api') {
    pathSegments.shift();
  }

  // Get data from Cloudflare Variables
  let data;
  try {
    // Use Cloudflare Variables to store your data
    data = JSON.parse(env.DATA_JSON || '{}');
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid data format' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Handle different API routes
  if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'data')) {
    // GET /api/data - Return all data
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } 
  else if (pathSegments[0] === 'data' && pathSegments[1] === 'batches' && pathSegments.length === 3 && pathSegments[3] === 'subjects') {
    // GET /api/data/batches/:batchId/subjects
    const batchId = pathSegments[2];
    const batch = data.batches[batchId];
    
    if (!batch || !batch.subjects) {
      return new Response(JSON.stringify({ error: 'Batch or subjects not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const subjects = Object.entries(batch.subjects).map(([key, subject]) => ({
      key,
      ...subject
    }));

    return new Response(JSON.stringify(subjects), {
      headers: { 'Content-Type': 'application/json' }
    });
  } 
  else if (pathSegments[0] === 'data' && pathSegments[1] === 'batches' && pathSegments[3] === 'subjects' && pathSegments.length === 6 && pathSegments[5] === 'topics') {
    // GET /api/data/batches/:batchId/subjects/:subjectId/topics
    const batchId = pathSegments[2];
    const subjectId = pathSegments[4];
    
    const batch = data.batches[batchId];
    const subject = batch?.subjects?.[subjectId];

    if (!subject || !subject.topics) {
      return new Response(JSON.stringify({ error: 'Subject or topics not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const topics = Object.entries(subject.topics).map(([key, topic]) => ({
      key,
      ...topic,
      lectures: Array.isArray(topic.lectures) ? topic.lectures : Object.values(topic.lectures || {}),
      notes: Array.isArray(topic.notes) ? topic.notes : Object.values(topic.notes || {}),
      dpps: Array.isArray(topic.dpps) ? topic.dpps : Object.values(topic.dpps || {})
    }));

    return new Response(JSON.stringify(topics), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Default: 404 not found
  return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}
