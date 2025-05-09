export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get('videoUrl') || '';
  const title = url.searchParams.get('title') || 'Lecture Video';
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #0e0f1b; color: white; }
    .header { background: #1a1b2f; padding: 1rem; display: flex; align-items: center; color: gold; }
    .back { color: gold; text-decoration: none; font-size: 1.5rem; margin-right: 1rem; }
    iframe { width: 100%; height: 90vh; border: none; }
  </style>
</head>
<body>

<div class="header">
  <a class="back" href="javascript:history.back()">←</a>
  <div>${title}</div>
</div>

<iframe src="${videoUrl}" allowfullscreen></iframe>

</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}
