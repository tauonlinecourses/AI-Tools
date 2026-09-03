export interface ForumComment {
  id: string;
  author?: string;
  author_label?: string | null;
  created_at?: string;
  updated_at?: string;
  raw_body?: string;
  rendered_body?: string;
  parent_id?: string | null;
  endorsed?: boolean;
  child_count?: number;
  children?: ForumComment[];
}

export interface ForumThread {
  id: string;
  title?: string;
  author?: string;
  author_label?: string | null;
  created_at?: string;
  updated_at?: string;
  modified_at?: string;
  last_activity_at?: string;
  comment_count?: number;
  raw_body?: string;
  rendered_body?: string;
  comment_list_url?: string | null;
  endorsed_comment_list_url?: string | null;
  non_endorsed_comment_list_url?: string | null;
  comments?: ForumComment[];
  comments_error?: string;
  [key: string]: unknown;
}

export interface FetchRequestStats {
  loginRequests: number;
  forumApiRequests: number;
  totalRequests: number;
  usedCookies: boolean;
  durationMs: number;
}

export interface ForumThreadsResponse {
  courseId: string;
  totalCount: number | null;
  pageSize: number;
  threads: ForumThread[];
  categoryName?: string;
  topicIds?: string[];
  forumUiOrigin?: string;
  requestStats?: FetchRequestStats;
  since?: string;
  reachedSinceWatermark?: boolean;
  pagesFetched?: number;
}

export interface KnownThreadSnapshot {
  id: string;
  last_activity_at?: string;
  comment_count?: number;
}

