try {
  const { nanoid } = require('nanoid');
  console.log('nanoid works:', nanoid(6));
} catch (err) {
  console.error('nanoid error:', err.message);
}
