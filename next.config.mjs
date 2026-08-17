/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.247"],
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
