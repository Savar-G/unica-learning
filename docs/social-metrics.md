# Social metrics

Open **Admin → Marketing → Social** to compare channels, check posts at about 48 hours and 7 days, and see what tagged links brought to the site. The page uses the admin's session. Provider credentials and the Supabase write key stay on the server.

## Connect the accounts

Set these variables for the production application. A channel with missing credentials shows as **Not connected**.

| Channel | Environment variables | Setup |
|---|---|---|
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` | Enable YouTube Data API v3 and YouTube Analytics API in the OAuth app's Google Cloud project. Use the channel owner's offline OAuth grant with `youtube.readonly` and `yt-analytics.readonly` scopes. |
| Facebook | `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID` | Use a long-lived Page token for the Unica Learning Page. The app needs `pages_read_engagement` and `read_insights`. To find the Page through the account list, also grant `pages_show_list`. |
| Instagram | `META_PAGE_ACCESS_TOKEN`, `META_IG_USER_ID` | Use the token for the Page linked to the Instagram professional account with `instagram_basic` and `instagram_manage_insights`. |
| TikTok and LinkedIn | None | These channels wait for API access and an adapter. |

The daily cron calls `/api/social-metrics` at 16:00 UTC with the existing `CRON_SECRET`. The route and **Refresh now** share a ten-minute cooldown. A provider error appears under its channel, while the other channels can still save their insights. Credentials and provider response bodies never appear in the error log.

## How the numbers are read

- **YouTube.** Data API provides the account, follower count, public uploads and current video counts. Analytics provides daily views, likes, comments, shares and subscriber gains. It also provides per-video watch time, average percent viewed, shares and subscriber gains. When available, the audience reports show age and gender share, views by country and views by traffic source. The channel reports use YouTube's Pacific date labels and can arrive a few days late. Average watch time and percentage use the Analytics reporting cutoff. [Data API Videos](https://developers.google.com/youtube/v3/docs/videos). [YouTube Analytics channel reports](https://developers.google.com/youtube/analytics/channel_reports).
- **Instagram.** Graph API v26.0 reads professional account and post insights. Account metrics include `views`, `reach`, `total_interactions`, `profile_views`, `profile_links_taps` and the follows breakdown when available. Media reads use native `views`, `reach`, `shares` and `saved`. Feed posts can report follows. Reel average watch time comes in milliseconds and displays in seconds. Age and country use `follower_demographics` when Meta makes it available, typically from 100 followers. [Instagram Insights](https://developers.facebook.com/docs/instagram-platform/insights/).
- **Facebook.** Graph API v26.0 uses `page_media_view` and `page_total_media_view_unique`, and their post-level equivalents `post_media_view` and `post_total_media_view_unique`. Page clicks use `page_total_actions`, which includes contact and action buttons. Likes and available comment counts come from lifetime post insights. The video insights edge supplies average watch time and Reel follows where eligible. Meta documents a threshold of 100 Page likes for Page insights and 100 people for demographic breakdowns. A retired, unavailable or ineligible metric may be blank. [Page Insights](https://developers.facebook.com/docs/graph-api/reference/insights/). [Video Insights](https://developers.facebook.com/docs/graph-api/reference/video/video_insights).
- **Windows.** Each pull imports posts published in the previous 30 calendar days and the current day, refreshes the two seven-day account windows and stores the current follower count. Daily reach is summed, so it can count a person on multiple days or channels. When a platform gives follower totals without daily gains, the comparison shows observed net change if both boundary counts exist. Provider counts can include paid activity. Missing values stay blank, and partial totals show coverage. The post table shows the 500 most recent imported posts. The closest saved read within 24 hours of a milestone supplies its numbers. Older reads stay in the database.
- **Site results.** Add a post's exact `utm_content` and optional `utm_campaign`. An empty campaign matches links with no campaign. Use a unique pair for each post, and include a `utm_source` in the link so the existing visit counter records it. A tagged post's site counts start at publication. The funnel uses events from the last seven full Pacific days. Visits count tabs, and signups, math checks started and saved cards count families, excluding test and team families. A saved card is an intent signal. The social funnel shows aggregate stage counts with independent coverage. See [Ad tracking](ad-tracking.md).
- **Email.** The last seven full Pacific days of sends are joined to their delivery events. Repeated provider message IDs count once. Failed includes bounced and suppressed mail. Clicks are the signed-in landing counts from `email_log.clicks` and `reports.email_clicks`, recorded for those messages through the time the dashboard loads. See D-105 in [Decision history](../.design/decisions.md).

## Storage

`social_accounts` and `social_posts` store channel and post identities. Admins edit tracking tags through a server endpoint. The import preserves those tags. The server appends to `social_post_snapshots`, `social_daily_snapshots` and `social_audience_snapshots`, with refresh admission and outcomes in `social_refreshes` and `social_refresh_results`. Admins can read the tables. Family and child records stay out of social storage and responses. The attribution function reads their existing records to return counts only.

Issue #913 tracks planning, quality scoring, repeat warnings and spreadsheet import as follow-up scope.
