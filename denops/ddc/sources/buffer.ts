import {
  BaseSource,
  Candidate,
  Context,
  DdcOptions,
  SourceOptions,
} from "https://deno.land/x/ddc_vim@v0.1.0/types.ts";
import { Denops, fn, gather } from "https://deno.land/x/ddc_vim@v0.1.0/deps.ts";
import { imap, range } from "https://deno.land/x/itertools@v0.1.3/mod.ts";

export function splitPages(
  minLines: number,
  maxLines: number,
  size: number,
): Iterable<[number, number]> {
  return imap(
    range(minLines, /* < */ maxLines + 1, size),
    (lnum: number) => [lnum, /* <= */ lnum + size - 1],
  );
}

export function allWords(lines: string[]): string[] {
  return lines.flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0]).filter((e, i, self) => self.indexOf(e) === i);
}

type Params = {
  requireSameFiletype: boolean;
  limitBytes: number;
  fromAltBuf: boolean;
};

type bufCache = {
  bufnr: number;
  filetype: string;
  candidates: Candidate[];
};

export class Source extends BaseSource {
  private buffers: bufCache[] = [];
  private pageSize = 500;
  events = ["BufReadPost", "BufWritePost", "InsertLeave"];

  private async gatherWords(denops: Denops, endLine: number): Promise<Candidate[]> {
    const ps = await gather(denops, async (denops) => {
      for (const [s, e] of splitPages(1, endLine, this.pageSize)) {
        await fn.getline(denops, s, e);
      }
    }) as string[][];
    return allWords(ps.flatMap((p) => p)).map((word) => ({ word }));
  }

  private async makeCache(
    denops: Denops,
    filetype: string,
    limit: number,
  ): Promise<void> {
    const endLine = await fn.line(denops, "$");
    const size = (await fn.line2byte(
      denops,
      endLine + 1,
    )) - 1;
    if (size > limit) {
      return;
    }
    const bufnr = await fn.bufnr(denops);

    this.buffers[bufnr] = {
      bufnr: bufnr,
      filetype: filetype,
      candidates: await this.gatherWords(denops, endLine),
    };
  }

  async onInit(
    denops: Denops,
  ): Promise<void> {
    this.makeCache(
      denops,
      await fn.getbufvar(denops, "%", "&filetype") as string,
      1e6,
    );
  }

  async onEvent(
    denops: Denops,
    context: Context,
    _ddcOptions: DdcOptions,
    _options: SourceOptions,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.makeCache(denops, context.filetype, params.limitBytes as number);

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
    const altbuf = await fn.bufnr(denops, "#");
    let buffers = this.buffers.filter((buf) => 
      !params.requireSameFiletype || (buf.filetype == context.filetype) ||
      tabBufnrs.includes(buf.bufnr) ||
      (params.fromAltBuf && (altbuf == buf.bufnr))
    );

    return buffers.map((buf) => buf.candidates).flatMap((candidate) =>
      candidate
    );
  }

  params(): Record<string, unknown> {
    const params: Params = {
      requireSameFiletype: true,
      limitBytes: 1e6,
      fromAltBuf: false,
    };
    return params as unknown as Record<string, unknown>;
  }
}
