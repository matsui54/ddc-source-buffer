import {
  BaseSource,
  Candidate,
  Context,
  DdcOptions,
  SourceOptions,
} from "https://deno.land/x/ddc_vim@v0.0.13/types.ts";
import { Denops, fn } from "https://deno.land/x/ddc_vim@v0.0.13/deps.ts";

function allWords(lines: string[]): string[] {
  return lines.flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0]).filter((e, i, self) => self.indexOf(e) === i);
}

type Params = {
  requireSameFiletype: boolean;
};

type bufCache = {
  bufnr: number;
  filetype: string;
  candidates: Candidate[];
};

export class Source extends BaseSource {
  private buffers: bufCache[] = [];
  private limit = 1e6;
  events = ["BufReadPost", "BufWritePost", "InsertLeave"];

  private async makeCache(denops: Denops, filetype: string): Promise<void> {
    const endLine = await fn.line(denops, "$") as number;
    const size = (await fn.line2byte(
      denops,
      endLine + 1,
    ) as number) - 1;
    if (size > this.limit) {
      return;
    }
    const bufnr = await fn.bufnr(denops);

    this.buffers[bufnr] = {
      bufnr: bufnr,
      filetype: filetype,
      candidates: allWords(
        await fn.getline(denops, 1, endLine),
      ).map((word) => ({ word })),
    };
  }

  async onInit(
    denops: Denops,
  ): Promise<void> {
    this.makeCache(
      denops,
      await fn.getbufvar(denops, "%", "&filetype") as string,
    );
  }

  async onEvent(
    denops: Denops,
    context: Context,
    _ddcOptions: DdcOptions,
    _options: SourceOptions,
    _params: Record<string, unknown>,
  ): Promise<void> {
    await this.makeCache(denops, context.filetype);

    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    this.buffers = this.buffers.filter(async (buffer) =>
      buffer.bufnr in tabBufnrs ||
      (await fn.buflisted(denops, buffer.bufnr))
    );
  }

  async gatherCandidates(
    denops: Denops,
    context: Context,
    _ddcOptions: DdcOptions,
    _options: SourceOptions,
    params: Record<string, unknown>,
  ): Promise<Candidate[]> {
    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    let buffers = this.buffers.filter((buf) =>
      !params.requireSameFiletype || (buf.filetype == context.filetype) ||
      buf.bufnr in tabBufnrs
    );
    return buffers.map((buf) => buf.candidates).flatMap((candidate) =>
      candidate
    );
  }

  params(): Record<string, unknown> {
    const params: Params = {
      requireSameFiletype: true,
    };
    return params as unknown as Record<string, unknown>;
  }
}
