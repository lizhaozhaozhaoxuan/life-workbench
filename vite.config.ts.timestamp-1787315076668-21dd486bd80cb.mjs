// vite.config.ts
import { defineConfig } from "file:///Users/lizhaoxuan/WorkBuddy/2026-07-26-09-39-00/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/lizhaoxuan/WorkBuddy/2026-07-26-09-39-00/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { VitePWA } from "file:///Users/lizhaoxuan/WorkBuddy/2026-07-26-09-39-00/node_modules/vite-plugin-pwa/dist/index.js";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///Users/lizhaoxuan/WorkBuddy/2026-07-26-09-39-00/vite.config.ts";
var vite_config_default = defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "\u4E2A\u4EBA\u5168\u7EF4\u5EA6\u5DE5\u4F5C\u53F0",
        short_name: "\u5DE5\u4F5C\u53F0",
        description: "\u6A21\u5757\u5316\u4EEA\u8868\u76D8 - \u5DE5\u4F5C / \u751F\u6D3B / \u8FD0\u52A8 / \u5B66\u4E60 / \u8D22\u52A1 \u5168\u5C40\u638C\u63E1",
        theme_color: "#0ea5e9",
        background_color: "#0b1120",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html"
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbGl6aGFveHVhbi9Xb3JrQnVkZHkvMjAyNi0wNy0yNi0wOS0zOS0wMFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2xpemhhb3h1YW4vV29ya0J1ZGR5LzIwMjYtMDctMjYtMDktMzktMDAvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2xpemhhb3h1YW4vV29ya0J1ZGR5LzIwMjYtMDctMjYtMDktMzktMDAvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSAnbm9kZTp1cmwnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLnN2ZycsICdpY29uLnN2ZyddLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ1x1NEUyQVx1NEVCQVx1NTE2OFx1N0VGNFx1NUVBNlx1NURFNVx1NEY1Q1x1NTNGMCcsXG4gICAgICAgIHNob3J0X25hbWU6ICdcdTVERTVcdTRGNUNcdTUzRjAnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1x1NkEyMVx1NTc1N1x1NTMxNlx1NEVFQVx1ODg2OFx1NzZEOCAtIFx1NURFNVx1NEY1QyAvIFx1NzUxRlx1NkQzQiAvIFx1OEZEMFx1NTJBOCAvIFx1NUI2Nlx1NEU2MCAvIFx1OEQyMlx1NTJBMSBcdTUxNjhcdTVDNDBcdTYzOENcdTYzRTEnLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyMwZWE1ZTknLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnIzBiMTEyMCcsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgb3JpZW50YXRpb246ICdwb3J0cmFpdCcsXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnaWNvbi5zdmcnLCBzaXplczogJ2FueScsIHR5cGU6ICdpbWFnZS9zdmcreG1sJywgcHVycG9zZTogJ2FueSBtYXNrYWJsZScgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsc3ZnLHBuZyx3b2ZmMn0nXSxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogJy9pbmRleC5odG1sJ1xuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2VcbiAgICAgIH1cbiAgICB9KVxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpXG4gICAgfVxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiB0cnVlLFxuICAgIHBvcnQ6IDUxNzNcbiAgfVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1QsU0FBUyxvQkFBb0I7QUFDNVYsT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWUsV0FBVztBQUhtSyxJQUFNLDJDQUEyQztBQUt2UCxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsSUFDSixRQUFRO0FBQUEsTUFDTixjQUFjO0FBQUEsTUFDZCxlQUFlLENBQUMsZUFBZSxVQUFVO0FBQUEsTUFDekMsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFVBQ0wsRUFBRSxLQUFLLFlBQVksT0FBTyxPQUFPLE1BQU0saUJBQWlCLFNBQVMsZUFBZTtBQUFBLFFBQ2xGO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsY0FBYyxDQUFDLGtDQUFrQztBQUFBLFFBQ2pELGtCQUFrQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDVixTQUFTO0FBQUEsTUFDWDtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssY0FBYyxJQUFJLElBQUksU0FBUyx3Q0FBZSxDQUFDO0FBQUEsSUFDdEQ7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
