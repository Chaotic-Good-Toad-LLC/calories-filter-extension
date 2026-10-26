# БЖВК Filter

Browser extension that filters grocery products on [silpo.ua](https://silpo.ua) and [foodboom.ua](https://foodboom.ua) by nutritional values: protein, fat, carbs, and calories.

## Install

[![Get it for Firefox](https://i.imgur.com/TMOLdK6.png)](https://addons.mozilla.org/en-US/firefox/addon/%D0%B1%D0%B6%D0%B2%D0%BA-filter/)
[![Get it for Chrome](https://i.imgur.com/B0i5sn3.png)](https://chromewebstore.google.com/detail/mngejlphoicjjfeccejiakjjdhimjbhl)

## Features

- Filter products by protein, fat, carbs, and calories with configurable operators (>, >=, =, <=, <)
- "Protein more than fat" filter 💪
- Color-coded product cards (green = match, red = no match, yellow = no data)
- Nutrition data cached in localStorage for 7 days
- Dark and light theme support
- Collapsible filter panel with persistent settings

## Install from source

1. Clone the repository
2. In Chrome, open `chrome://extensions`, enable **Developer Mode**, click **Load unpacked** and select the project folder
3. In Firefox, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `manifest.json`

## Usage

Navigate to any product listing page on silpo.ua or foodboom.ua. The filter panel appears in the top-right corner. Set your desired nutritional thresholds and click **Застосувати фільтр**.

## Development

```sh
npm install   # once; jsdom for the tests
npm test      # runs the tests against saved store pages
scripts/package.sh   # builds the Chrome and Firefox zips
```

CI runs the tests and checks the store zips on every pull request.
