/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Vary', value: 'Origin' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
