/**
 * SSOLAP 공통 타입 정의
 * API 응답 / 도메인 모델 / UI 상태 타입을 중앙 관리
 */

// ─── API 공통 응답 형식 ───────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface ApiError {
  detail: string;       // FastAPI 기본 에러 메시지
  code?: string;        // 비즈니스 에러 코드 (예: "INSUFFICIENT_POINTS")
  field?: string;       // 유효성 검사 실패 필드
}

// ─── 사용자 ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio?: string;
  avatar_url?: string;
  role: 'user' | 'creator' | 'admin';
  is_verified: boolean;
  is_active: boolean;
  point_balance: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  created_at: string;   // ISO 8601
}

export interface UserProfile extends User {
  is_following?: boolean;  // 내가 팔로우 중인지 (상대 프로필 조회 시)
  is_followed_by?: boolean;
}

// ─── 인증 ─────────────────────────────────────────────────────────────────────
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

export interface LoginRequest {
  username: string;   // 이메일 또는 아이디
  password: string;
}

export interface SignupRequest {
  username: string;
  display_name: string;
  email: string;
  password: string;
  password_confirm: string;
}

// ─── 게시물 미디어 ────────────────────────────────────────────────────────────
export interface PostMedia {
  id:            number;
  url:           string;
  media_type:    'image' | 'video';
  width?:        number;
  height?:       number;
  duration?:     number;
  display_order: number;
}

// ─── 게시물 작성자 요약 ───────────────────────────────────────────────────────
export interface AuthorBrief {
  id:           number;
  username:     string;
  display_name: string;
  avatar_url?:  string;
}

// ─── 게시물 ────────────────────────────────────────────────────────────────────
export type PostType = 'text' | 'image' | 'video' | 'short';

export interface Post {
  id:            number;
  author:        AuthorBrief;
  content?:      string;
  post_type:     PostType;
  is_public:     boolean;
  like_count:    number;
  comment_count: number;
  view_count:    number;
  media:         PostMedia[];
  is_liked:      boolean;
  created_at:    string;
  updated_at:    string;
}

// ─── 댓글 ─────────────────────────────────────────────────────────────────────
export interface Comment {
  id:         number;
  post_id:    number;
  author:     AuthorBrief;
  content:    string;
  parent_id?: number;
  like_count: number;
  created_at: string;
}

// ─── 채팅 ─────────────────────────────────────────────────────────────────────
export type RoomType = 'direct' | 'group' | 'channel';
export type EntryType = 'public' | 'password' | 'point' | 'pass';

export interface ChatRoom {
  id: string;
  name: string;
  type: RoomType;
  description?: string;
  avatar_url?: string;
  member_count: number;
  entry_control: {
    type: EntryType;
    entry_fee_points?: number;
  };
  last_message?: ChatMessage;
  unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender: UserProfile;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'system';
  is_secret: boolean;
  visible_to?: number[];  // secret 메시지 수신자
  moderation_status: 'pending' | 'safe' | 'warning' | 'flagged' | 'blocked';
  edit_history?: Array<{ content: string; edited_at: string }>;
  created_at: string;
}

// ─── S포인트 ───────────────────────────────────────────────────────────────────
export type PointAction =
  | 'daily_checkin'
  | 'post_create'
  | 'comment_create'
  | 'like_milestone'
  | 'ad_reward'
  | 'referral_bonus'
  | 'purchase';

export interface PointLog {
  id: number;
  action: PointAction;
  amount: number;       // 양수=획득, 음수=소비
  balance_after: number;
  description: string;
  created_at: string;
}

export interface DailyCap {
  earned_today: number;
  cap: number;          // 500
  remaining: number;
  reset_at: string;     // 다음 리셋 시간
}

// ─── 알림 ─────────────────────────────────────────────────────────────────────
export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'mention'
  | 'room_invite'
  | 'point_earned'
  | 'system';

export interface Notification {
  id: number;
  type: NotificationType;
  actor?: UserProfile;  // 행동 주체
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

// ─── 페이지네이션 ──────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}
