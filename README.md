# Leet - LeetCode Following Tracker

A Chrome extension that shows how many LeetCode problems you and the people you follow have solved today.

![Demo](images/demo.png)

## Features

- 📊 **Daily solve tracker** - See today's problem count for everyone you follow
- 🏆 **Leaderboard view** - Sorted by solve count to see who's grinding the hardest
- 👤 **Your stats included** - Your own progress highlighted at the top
- 🔗 **Quick profile access** - Click any username to visit their LeetCode profile
- 💾 **Remembers your username** - No need to re-enter every time
- 🎨 **Native LeetCode styling** - Dark theme that matches LeetCode's UI

## Installation

1. Clone this repository
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Navigate to leetcode.com and click the extension icon (or press `Ctrl+B`)

## Usage

1. Enter your LeetCode username
2. Click "Refresh" to load data
3. See your daily solve count alongside everyone you follow

## Tech Stack

- Chrome Extension (Manifest V3)
- LeetCode GraphQL API
- Vanilla JavaScript
