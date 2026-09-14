-- Reversal of 004: removes memory tables only. Lessons/episodes are not
-- business history; AgentRun/AgentEvent remain untouched.
DROP TABLE IF EXISTS "AgentLesson";
DROP TABLE IF EXISTS "AgentEpisode";
