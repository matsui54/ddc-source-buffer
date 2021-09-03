import {
  BaseSource,
  Candidate,
  DdcEvent,
} from "https://deno.land/x/ddc_vim@v0.5.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnEventArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.5.0/base/source.ts#^";
import { imap, range } from "https://deno.land/x/itertools@v0.1.3/mod.ts#^";
import { gather } from "https://deno.land/x/denops_std@v1.8.1/batch/mod.ts#^";
import * as fn from "https://deno.land/x/denops_std@v1.8.1/function/mod.ts#^";
import { Denops } from "https://deno.land/x/denops_std@v1.8.1/mod.ts#^";

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
  const words = lines
    .flatMap((line) => [...line.matchAll(/[_\p{L}\d]+/gu)])
    .map((match) => match[0]);
  return Array.from(new Set(words)); // remove duplication
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
  events = ["BufReadPost", "BufWritePost", "InsertLeave"] as DdcEvent[];

  private async gatherWords(
    denops: Denops,
    endLine: number,
  ): Promise<Candidate[]> {
    const ps = await gather(denops, async (denops: Denops) => {
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

  async onInit({ denops, sourceParams }: OnInitArguments): Promise<void> {
    this.makeCache(
      denops,
      await fn.getbufvar(denops, "%", "&filetype") as string,
      sourceParams.limitBytes as number,
    );
  }

  async onEvent({
    denops,
    context,
    sourceParams,
  }: OnEventArguments): Promise<void> {
    await this.makeCache(
      denops,
      context.filetype,
      sourceParams.limitBytes as number,
    );

    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    this.buffers = this.buffers.filter(async (buffer) =>
      buffer.bufnr in tabBufnrs ||
      (await fn.buflisted(denops, buffer.bufnr))
    );
  }

  async gatherCandidates({
    denops,
    context,
    sourceParams,
  }: GatherCandidatesArguments): Promise<Candidate[]> {
    const p = sourceParams as unknown as Params;
    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    const altbuf = await fn.bufnr(denops, "#");
    let buffers = this.buffers.filter((buf) =>
      !p.requireSameFiletype ||
      (buf.filetype == context.filetype) ||
      tabBufnrs.includes(buf.bufnr) ||
      (p.fromAltBuf && (altbuf == buf.bufnr))
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
