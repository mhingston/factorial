import { InMemoryTwinRuntime, type InMemoryTwinRuntimeOptions } from './runtime.js';
import { JiraIssueTwinStub } from './twins/jira-issue.stub.js';
import { SlackChannelTwinStub } from './twins/slack-channel.stub.js';

export function createReferenceTwinRuntime(
  options: InMemoryTwinRuntimeOptions = {}
): InMemoryTwinRuntime {
  const runtime = new InMemoryTwinRuntime(options);
  runtime.register(new JiraIssueTwinStub());
  runtime.register(new SlackChannelTwinStub());
  return runtime;
}
