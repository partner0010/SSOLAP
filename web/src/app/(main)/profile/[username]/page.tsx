'use client';

/**
 * profile/[username]/page.tsx — 유저 프로필 페이지
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PostCard from '@/components/feed/PostCard';
import toast from 'react-hot-toast';
import type { Post } from '@/types';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  id:              number;
  username:        string;
  display_name:    string;
  email:           string;
  bio:             string | null;
  avatar_url:      string | null;
  role:            string;
  is_verified:     boolean;
  follower_count:  number;
  following_count: number;
  post_count:      number;
  point_balance:   number;
  is_following:    boolean;
  created_at:      string;
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start gap-5 mb-8">
        <div className="w-20 h-20 bg-ssolap-border flex-shrink-0" />
        <div className="flex-1 pt-2">
          <div className="h-5 w-36 bg-ssolap-border mb-2" />
          <div className="h-3 w-24 bg-ssolap-border/60 mb-4" />
          <div className="flex gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-4 w-8 bg-ssolap-border mb-1" />
                <div className="h-2.5 w-12 bg-ssolap-border/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: me, updateUser } = useAuthStore();

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [posts,       setPosts]       = useState<Post[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isOwnProfile = me?.username === username;

  // ── 프로필 + 게시물 로드 ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [profileData, feedData] = await Promise.all([
          api.get<UserProfile>(`/users/${username}`),
          api.get<{ posts: Post[] }>(`/users/${username}/posts`),
        ]);
        setProfile(profileData);
        setIsFollowing(profileData.is_following);
        setPosts(feedData.posts);
      } catch {
        toast.error('프로필을 불러오지 못했습니다');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [username]);

  // ── 팔로우 토글 ──────────────────────────────────────────────────────
  const handleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    try {
      const data = await api.post<{ followed: boolean; follower_count: number }>(
        `/users/${username}/follow`
      );
      setIsFollowing(data.followed);
      setProfile((p) =>
        p ? { ...p, follower_count: data.follower_count } : p
      );
      toast.success(data.followed ? `@${username}님을 팔로우했습니다` : '언팔로우했습니다');
    } catch {
      toast.error('처리에 실패했습니다');
    } finally {
      setFollowLoading(false);
    }
  };

  if (isLoading) return <ProfileSkeleton />;
  if (!profile)  return (
    <div className="text-center py-20 text-ssolap-muted text-sm">
      유저를 찾을 수 없습니다
    </div>
  );

  return (
    <div>
      {/* ── 프로필 헤더 ────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-start gap-5">
          {/* 아바타 */}
          <div className="
            w-20 h-20 bg-ssolap-silver/10 border border-ssolap-border
            flex items-center justify-center text-ssolap-silver text-2xl font-black
            flex-shrink-0
          ">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            ) : (
              profile.display_name[0].toUpperCase()
            )}
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h1 className="text-ssolap-silver font-bold text-lg leading-tight">
                  {profile.display_name}
                </h1>
                <p className="text-ssolap-muted text-xs mt-0.5">
                  @{profile.username}
                  {profile.is_verified && (
                    <span className="ml-1.5 text-ssolap-silver">✦</span>
                  )}
                </p>
              </div>

              {/* 팔로우 버튼 */}
              {!isOwnProfile && (
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`
                    flex-shrink-0 text-xs px-5 py-2 font-semibold tracking-wide
                    transition-all disabled:opacity-50
                    ${isFollowing
                      ? 'border border-ssolap-border text-ssolap-muted hover:border-red-500/40 hover:text-red-400'
                      : 'btn-primary'
                    }
                  `}
                >
                  {followLoading ? '...' : isFollowing ? '팔로잉' : '팔로우'}
                </button>
              )}
            </div>

            {/* 자기소개 */}
            {profile.bio && (
              <p className="text-ssolap-silver/80 text-sm leading-relaxed mt-2 mb-3">
                {profile.bio}
              </p>
            )}

            {/* 통계 */}
            <div className="flex gap-6 mt-3">
              {[
                { label: '게시물',  value: profile.post_count },
                { label: '팔로워',  value: profile.follower_count },
                { label: '팔로잉',  value: profile.following_count },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-ssolap-silver font-bold text-sm font-mono">
                    {value.toLocaleString()}
                  </p>
                  <p className="text-ssolap-muted text-[10px] tracking-wide mt-0.5">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 게시물 목록 ────────────────────────────────────────────── */}
      <div className="mb-4">
        <h2 className="text-ssolap-silver text-xs font-bold tracking-[0.3em] uppercase mb-5">
          게시물 {profile.post_count > 0 && <span className="text-ssolap-muted font-mono">{profile.post_count}</span>}
        </h2>

        {posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-3xl text-ssolap-silver/20 mb-3">◈</div>
            <p className="text-ssolap-muted text-xs tracking-widest">아직 게시물이 없습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDeleted={() => setPosts((p) => p.filter((x) => x.id !== post.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
