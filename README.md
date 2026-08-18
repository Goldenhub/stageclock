# StageClock

A lightweight, cross-platform local event management application for controlling and displaying live presentation timers.

## Features

- **Timer Control**: Create, schedule, play, pause, and stop timed event segments with custom titles and durations
- **Dual-Display Architecture**: Operator control hub (desktop) + full-screen stage/confidence monitor (second display)
- **Mobile Remote**: Control schedules, start/stop timers, and create events from any smartphone on the same local Wi-Fi
- **Schedule Management**: Create multiple schedules, drag-and-drop reordering, import/export to JSON
- **Visual Alerts**: Color-coded countdown (normal → warning → critical → overtime) with flash animations
- **Auto-Advance**: Automatically load the next schedule item when a timer completes
- **Customizable Branding**: Brand color, logo text, and display font scale

## Tech Stack

- **Backend**: Rust (Tauri v2) with Axum HTTP/WebSocket server
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Mobile Remote**: Vanilla HTML/CSS/JS served from an embedded Axum server
- **Discovery**: mDNS/DNS-SD for automatic phone discovery on local network

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
npm install
```

### Run in Development

```bash
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
```

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   Control Window     │     │   Display Window     │
│   (Operator Hub)     │     │   (Stage Monitor)    │
│   React + TypeScript │     │   React + TypeScript │
└─────────┬───────────┘     └─────────┬───────────┘
          │ Tauri IPC                  │ Tauri Events
          └──────────┬────────────────┘
                     │
          ┌──────────┴──────────┐
          │   Rust Backend      │
          │   (Tauri v2)        │
          │   Timer State       │
          │   Schedule Sync     │
          └──────────┬──────────┘
                     │ WebSocket
          ┌──────────┴──────────┐
          │   Mobile Remote     │
          │   (Phone Browser)   │
          │   Port 3000         │
          └─────────────────────┘
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
