# ddc-buffer
Buffer source for ddc.vim

This source collects keywords from current buffer, buffers whose window is in the same tabpage and buffers which has the same filetype.

## Required

### denops.vim
https://github.com/vim-denops/denops.vim

### ddc.vim
https://github.com/Shougo/ddc.vim

## Configuration
For detail, please see [help](doc/ddc-buffer.txt).

### example
```vim
call ddc#custom#patch_global('sources', ['buffer'])
call ddc#custom#patch_global('sourceOptions', {
    \ '_': {'matchers': ['matcher_head']},
    \ 'buffer': {'mark': 'B'},
    \ })

call ddc#custom#patch_global('sourceParams', {
    \ 'buffer': {
    \   'requireSameFiletype': v:false,
    \   'limitBytes': 5000000,
    \   'fromAltBuf': v:true,
    \   'forceCollect': v:true,
    \ },
    \ })
```
