

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Disable symlink resolution + filesystem cache to work around EISDIR on Windows + Node 22
    config.resolve.symlinks = false;
    config.cache = false;
    return config;
  },
};

export default nextConfig;
