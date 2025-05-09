<?php
$videoUrl = isset($_GET['videoUrl']) ? $_GET['videoUrl'] : '';
$title = isset($_GET['title']) ? $_GET['title'] : 'Lecture Video';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title><?php echo htmlspecialchars($title); ?></title>
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
  <div><?php echo htmlspecialchars($title); ?></div>
</div>

<iframe src="<?php echo htmlspecialchars($videoUrl); ?>" allowfullscreen></iframe>

</body>
</html>
