/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ['pdf-parse', 'word-extractor', 'mammoth']
};

export default nextConfig;
