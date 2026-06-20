const appJson = require("./app.json");

const baseUrl = process.env.EXPO_PUBLIC_BASE_PATH || "";

module.exports = () => ({
  ...appJson.expo,
  experiments: {
    ...(appJson.expo.experiments || {}),
    baseUrl,
  },
});
