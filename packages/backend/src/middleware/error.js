export default function errorMw(err, _req, res, _next){
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
}
