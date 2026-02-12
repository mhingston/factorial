import { InMemoryTwinRuntime, type InMemoryTwinRuntimeOptions } from './runtime.js';
import { AwsS3TwinStub } from './twins/aws-s3.stub.js';
import { DatabaseTwinStub } from './twins/database.stub.js';
import { GitHubIssueTwinStub } from './twins/github-issue.stub.js';
import { JiraIssueTwinStub } from './twins/jira-issue.stub.js';
import { PostgresTwinStub } from './twins/postgres.stub.js';
import { RedisTwinStub } from './twins/redis.stub.js';
import { SendGridTwinStub } from './twins/sendgrid.stub.js';
import { SlackChannelTwinStub } from './twins/slack-channel.stub.js';
import { StripeTwinStub } from './twins/stripe.stub.js';

export function createReferenceTwinRuntime(
  options: InMemoryTwinRuntimeOptions = {}
): InMemoryTwinRuntime {
  const runtime = new InMemoryTwinRuntime(options);
  runtime.register(new AwsS3TwinStub());
  runtime.register(new GitHubIssueTwinStub());
  runtime.register(new DatabaseTwinStub());
  runtime.register(new JiraIssueTwinStub());
  runtime.register(new PostgresTwinStub());
  runtime.register(new RedisTwinStub());
  runtime.register(new SendGridTwinStub());
  runtime.register(new SlackChannelTwinStub());
  runtime.register(new StripeTwinStub());
  return runtime;
}
