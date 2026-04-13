'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { ApiError } from '@/types';

// ─── 유효성 검사 스키마 ───────────────────────────────────────────────────────
const loginSchema = z.object({
  username: z.string().min(1, '아이디 또는 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});

type LoginForm = z.infer<typeof loginSchema>;

// ─── 로그인 페이지 ────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router   = useRouter();
  const login    = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data);
      toast.success('로그인 성공');
      router.push('/feed');
    } catch (err) {
      // FastAPI 에러: detail이 문자열이거나 배열(422 validation)일 수 있음
      const apiErr = err as ApiError & { detail?: unknown };
      const msg = typeof apiErr.detail === 'string'
        ? apiErr.detail
        : Array.isArray(apiErr.detail)
          ? (apiErr.detail[0] as { msg?: string })?.msg ?? '로그인에 실패했습니다'
          : '로그인에 실패했습니다';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-ssolap-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-10">
          <Link href="/">
            <span className="text-ssolap-silver font-black text-2xl tracking-[0.4em]">
              SSOLAP
            </span>
          </Link>
          <p className="text-ssolap-muted text-xs tracking-[0.2em] mt-2">
            계정에 로그인하세요
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

          {/* 아이디 */}
          <div>
            <label className="section-label block mb-1.5">아이디 / 이메일</label>
            <input
              {...register('username')}
              type="text"
              className="input"
              placeholder="username 또는 email@example.com"
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-red-700 text-xs mt-1">{errors.username.message}</p>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="section-label block mb-1.5">비밀번호</label>
            <input
              {...register('password')}
              type="password"
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="text-red-700 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full mt-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border border-current border-t-transparent
                                 rounded-full animate-spin" />
                처리 중...
              </span>
            ) : '로그인'}
          </button>

        </form>

        {/* 구분선 */}
        <div className="divider mt-6" />

        {/* 회원가입 링크 */}
        <p className="text-center text-ssolap-muted text-xs tracking-wide">
          계정이 없으신가요?{' '}
          <Link href="/auth/signup" className="text-ssolap-silver hover:underline">
            회원가입
          </Link>
        </p>

      </div>
    </div>
  );
}
