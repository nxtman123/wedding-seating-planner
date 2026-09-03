// Static export for GitHub Pages.
// For a project page served at https://<user>.github.io/<repo>, build with
//   NEXT_PUBLIC_BASE_PATH=/<repo> npm run build
// For a user/org page or custom domain served at the root, leave it unset.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
