"""Persistent CUDA Driver/NVRTC worker. Python standard library only; no pip modules."""
import ctypes as c
import glob, json, os, pathlib, struct, sys, time

def send(data):
    sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
    sys.stdout.buffer.flush()

def exact(n):
    out = bytearray()
    while len(out) < n:
        part = sys.stdin.buffer.read(n-len(out))
        if not part: return None
        out.extend(part)
    return out

def checked(fn, *args):
    code = fn(*args)
    if code: raise RuntimeError('%s failed (%d)' % (fn.__name__, code))

def main():
    roots = [os.environ.get('CUDA_PATH', '')] + glob.glob(r'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v*')
    candidates = []
    for root in roots:
        if root: candidates += glob.glob(os.path.join(root, 'bin', '**', 'nvrtc64*.dll'), recursive=True)
    candidates = [p for p in candidates if '.alt.' not in p]
    if not candidates: raise RuntimeError('CUDA Toolkit NVRTC not found')
    library = sorted(candidates)[-1]
    dll_directory = os.add_dll_directory(os.path.dirname(library))
    cuda = c.WinDLL('nvcuda.dll'); rtc = c.CDLL(library)
    # Explicit signatures prevent 64-bit device pointers being truncated.
    signatures = {
        'cuInit': [c.c_uint], 'cuDeviceGetCount': [c.POINTER(c.c_int)],
        'cuDeviceGet': [c.POINTER(c.c_int), c.c_int],
        'cuDeviceGetName': [c.c_void_p, c.c_int, c.c_int],
        'cuDeviceGetAttribute': [c.POINTER(c.c_int), c.c_int, c.c_int],
        'cuDeviceTotalMem_v2': [c.POINTER(c.c_size_t), c.c_int],
        'cuDeviceGetUuid_v2': [c.c_void_p, c.c_int],
        'cuCtxCreate_v2': [c.POINTER(c.c_void_p), c.c_uint, c.c_int],
        'cuModuleLoadData': [c.POINTER(c.c_void_p), c.c_void_p],
        'cuModuleGetFunction': [c.POINTER(c.c_void_p), c.c_void_p, c.c_char_p],
        'cuMemAlloc_v2': [c.POINTER(c.c_uint64), c.c_size_t],
        'cuMemFree_v2': [c.c_uint64],
        'cuMemcpyHtoD_v2': [c.c_uint64, c.c_void_p, c.c_size_t],
        'cuMemcpyDtoH_v2': [c.c_void_p, c.c_uint64, c.c_size_t],
        'cuLaunchKernel': [c.c_void_p]+[c.c_uint]*7+[c.c_void_p,c.c_void_p,c.c_void_p],
        'cuCtxSynchronize': [], 'cuCtxDestroy_v2': [c.c_void_p],
    }
    for name, args in signatures.items():
        fn = getattr(cuda, name); fn.argtypes = args; fn.restype = c.c_int
    rtc.nvrtcCreateProgram.argtypes = [c.POINTER(c.c_void_p),c.c_char_p,c.c_char_p,c.c_int,c.c_void_p,c.c_void_p]
    rtc.nvrtcCompileProgram.argtypes = [c.c_void_p,c.c_int,c.POINTER(c.c_char_p)]
    for suffix in ['PTXSize','ProgramLogSize']:
        getattr(rtc,'nvrtcGet'+suffix).argtypes = [c.c_void_p,c.POINTER(c.c_size_t)]
    for suffix in ['PTX','ProgramLog']:
        getattr(rtc,'nvrtcGet'+suffix).argtypes = [c.c_void_p,c.c_void_p]
    rtc.nvrtcDestroyProgram.argtypes = [c.POINTER(c.c_void_p)]
    checked(cuda.cuInit,0); count=c.c_int();checked(cuda.cuDeviceGetCount,c.byref(count))
    choices=[]
    for ordinal in range(count.value):
        device=c.c_int();checked(cuda.cuDeviceGet,c.byref(device),ordinal)
        name=c.create_string_buffer(256);checked(cuda.cuDeviceGetName,name,256,device.value)
        integrated=c.c_int();checked(cuda.cuDeviceGetAttribute,c.byref(integrated),18,device.value)
        mem=c.c_size_t();checked(cuda.cuDeviceTotalMem_v2,c.byref(mem),device.value)
        if not integrated.value: choices.append((mem.value,device.value,name.value.decode()))
    if not choices: raise RuntimeError('No discrete CUDA GPU found')
    mem,device,name=max(choices)
    major=c.c_int();minor=c.c_int();checked(cuda.cuDeviceGetAttribute,c.byref(major),75,device);checked(cuda.cuDeviceGetAttribute,c.byref(minor),76,device)
    uuid=c.create_string_buffer(16);checked(cuda.cuDeviceGetUuid_v2,uuid,device)
    context=c.c_void_p();checked(cuda.cuCtxCreate_v2,c.byref(context),0,device)
    source=pathlib.Path(__file__).with_name('cuda-risk.cu').read_bytes()
    program=c.c_void_p();checked(rtc.nvrtcCreateProgram,c.byref(program),source,b'cuda-risk.cu',0,None,None)
    options=(c.c_char_p*2)(('--gpu-architecture=compute_%d%d'%(major.value,minor.value)).encode(),b'--fmad=false')
    code=rtc.nvrtcCompileProgram(program,2,options)
    if code:
        size=c.c_size_t();checked(rtc.nvrtcGetProgramLogSize,program,c.byref(size));log=c.create_string_buffer(size.value);checked(rtc.nvrtcGetProgramLog,program,log);raise RuntimeError(log.value.decode())
    size=c.c_size_t();checked(rtc.nvrtcGetPTXSize,program,c.byref(size));ptx=c.create_string_buffer(size.value);checked(rtc.nvrtcGetPTX,program,ptx);checked(rtc.nvrtcDestroyProgram,c.byref(program))
    module=c.c_void_p();checked(cuda.cuModuleLoadData,c.byref(module),ptx)
    function=c.c_void_p();checked(cuda.cuModuleGetFunction,c.byref(function),module,b'npc_risk')
    send(json.dumps({'available':True,'backend':'CUDA','discrete':True,'device':name,'uuid':uuid.raw.hex(),'memoryMB':mem//1048576,'computeCapability':'%d.%d'%(major.value,minor.value),'pid':os.getpid()}).encode())
    capacity=0;d_input=c.c_uint64();d_output=c.c_uint64()
    try:
        while True:
            header=exact(4)
            if header is None: break
            length=struct.unpack('<I',header)[0]
            if not length or length>3200000: raise RuntimeError('Invalid GPU batch size')
            payload=exact(length)
            if payload is None or length%32: raise RuntimeError('Truncated GPU batch')
            n=length//32
            if n>capacity:
                if capacity: checked(cuda.cuMemFree_v2,d_input);checked(cuda.cuMemFree_v2,d_output)
                capacity=n;checked(cuda.cuMemAlloc_v2,c.byref(d_input),n*32);checked(cuda.cuMemAlloc_v2,c.byref(d_output),n*16)
            host_input=(c.c_char*length).from_buffer(payload);host_output=c.create_string_buffer(n*16)
            started=time.perf_counter();checked(cuda.cuMemcpyHtoD_v2,d_input,host_input,length)
            size_arg=c.c_int(n);params=(c.c_void_p*3)(c.addressof(d_input),c.addressof(d_output),c.addressof(size_arg))
            checked(cuda.cuLaunchKernel,function,(n+127)//128,1,1,128,1,1,0,None,params,None)
            checked(cuda.cuCtxSynchronize);checked(cuda.cuMemcpyDtoH_v2,host_output,d_output,n*16)
            milliseconds=(time.perf_counter()-started)*1000
            send(struct.pack('<d',milliseconds)+host_output.raw)
    finally:
        checked(cuda.cuCtxDestroy_v2,context)

try: main()
except Exception as error:
    send(json.dumps({'available':False,'error':str(error)}).encode())
    sys.exit(1)
