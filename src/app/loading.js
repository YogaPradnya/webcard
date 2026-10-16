import { PageSkeleton } from '@/components/PageState';

export default function Loading() {
  return <PageSkeleton lines={[40, 80, 60]} />;
}
