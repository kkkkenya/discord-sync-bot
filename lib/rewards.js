// Credits for files students add to the hub from Crux: each file the hub posts (not a duplicate) is one credit.
// GOAL credits in a semester earn Premium in Crux until the semester ends (its exams). Shared by Crux (the tier,
// the progress on the Notes tab) and the drive dumper (which marks files posted and sends the congratulations).
import { CALENDAR } from './config.js';
import { enc } from './db.js';

export const REWARD = { goal: 10, start: CALENDAR.semester.start, end: CALENDAR.exams.end };
// crux_uploads rows that count: posted this semester
export const creditsQuery = (userId) => `user_id=eq.${enc(userId)}&status=eq.posted&created_at=gte.${REWARD.start}&select=id`;
export const earned = (count, today) => count >= REWARD.goal && today <= REWARD.end;
