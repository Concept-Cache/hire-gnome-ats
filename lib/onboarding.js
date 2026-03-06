import { prisma } from '@/lib/prisma';
import { DEMO_MODE, getDemoLoginAccounts } from '@/lib/demo-config';

export async function getOnboardingState() {
	try {
		const [userCount, systemSettingCount] = await Promise.all([
			prisma.user.count(),
			prisma.systemSetting.count()
		]);
		const needsOnboarding = userCount === 0;
		return {
			needsOnboarding,
			hasUsers: userCount > 0,
			hasSystemSetting: systemSettingCount > 0,
			demoMode: DEMO_MODE,
			demoAccounts: getDemoLoginAccounts()
		};
	} catch {
		return {
			needsOnboarding: true,
			hasUsers: false,
			hasSystemSetting: false,
			demoMode: DEMO_MODE,
			demoAccounts: getDemoLoginAccounts()
		};
	}
}
