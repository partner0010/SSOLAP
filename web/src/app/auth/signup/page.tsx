'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import type { ApiError } from '@/types';

// ─── 유효성 검사 스키마 ───────────────────────────────────────────────────────
const signupSchema = z.object({
  username: z
    .string()
    .min(3, '아이디는 3자 이상이어야 합니다')
    .max(20, '아이디는 20자 이하여야 합니다')
    .regex(/^[a-zA-Z0-9_]+$/, '영문, 숫자, _만 사용 가능합니다'),
  display_name: z
    .string()
    .min(1, '표시 이름을 입력하세요')
    .max(30, '30자 이하여야 합니다'),
  email: z.string().email('올바른 이메일 형식이 아닙니다'),
  password: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, '영문과 숫자를 모두 포함해야 합니다'),
  password_confirm: z.string(),
}).refine((d) => d.password === d.password_confirm, {
  path: ['password_confirm'],
  message: '비밀번호가 일치하지 않습니다',
});

type SignupForm = z.infer<typeof signupSchema>;

// ─── 회원가입 페이지 ─────────────────────────────────────────────────────────
export default function SignupPage() {
  const router    = useRouter();
  const signup    = useAuthStore((s) => s.signup);
  const isLoading = useAuthStore((s) => s.isLoading);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupForm>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (data: SignupForm) => {
    try {
      await signup(data);
      toast.success('회원가입이 완료되었습니다!');
      router.push('/feed');
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error(apiErr.detail ?? '회원가입에 실패했습니다');
    }
  };

  return (
    <div className="min-h-screen bg-ssolap-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-ssolap-silver font-black text-2xl tracking-[0.4em]">
              SSOLAP
            </span>
          </Link>
          <p className="text-ssolap-muted text-xs tracking-[0.2em] mt-2">
            새 계정을 만들어보세요
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

          {/* 아이디 */}
          <div>
            <label className="section-label block mb-1.5">아이디</label>
            <input
              {...register('username')}
              type="text"
              className="input"
              placeholder="my_username"
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-red-700 text-xs mt-1">{errors.username.message}</p>
            )}
          </div>

          {/* 표시 이름 */}
          <div>
            <label className="section-label block mb-1.5">표시 이름</label>
            <input
              {...register('display_name')}
              type="text"
              className="input"
              placeholder="홍길동"
            />
            {errors.display_name && (
              <p className="text-red-700 text-xs mt-1">{errors.display_name.message}</p>
            )}
          </div>

          {/* 이메일 */}
          <div>
            <label className="section-label block mb-1.5">이메일</label>
            <input
              {...register('email')}
              type="email"
              className="input"
              placeholder="hello@example.com"
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-red-700 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="section-label block mb-1.5">비밀번호</label>
            <input
              {...register('password')}
              type="password"
              className="input"
              placeholder="영문+숫자 8자 이상"
              autoComplete="new-password"
            />
            {errors.password && (
              <p className="text-red-700 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* 비밀번호 확인 */}
          <div>
            <label className="section-label block mb-1.5">비밀번호 확인</label>
            <input
              {...register('password_confirm')}
              type="password"
              className="input"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {errors.password_confirm && (
              <p className="text-red-700 text-xs mt-1">{errors.password_confirm.message}</p>
            )}
          </div>

          {/* 가입 버튼 */}
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
            ) : '회원가입'}
          </button>

        </form>

        <div className="divider mt-6" />

        <p className="text-center text-ssolap-muted text-xs tracking-wide">
          이미 계정이 있으신가요?{' '}
          <Link href="/auth/login" className="text-ssolap-silver hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
