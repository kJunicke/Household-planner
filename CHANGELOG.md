# Changelog

## 2025-10-18 - Realtime Multi-User Updates

### Feature: Supabase Realtime Subscriptions
- **Database Migration**: Enable Realtime publication for `tasks` table
- **TaskStore**: Add `subscribeToTasks()` and `unsubscribeFromTasks()` functions
  - WebSocket channel with household_id filtering
  - Handles INSERT, UPDATE, DELETE events in real-time
  - Automatic local state synchronization
- **HomeView**: Implement subscription lifecycle management
  - Subscribe on component mount
  - Cleanup/unsubscribe on component unmount

### Impact
- Live updates between household members without page reload
- When User A creates/completes a task, User B sees changes instantly
- Foundation for true multi-user collaborative experience
