__device__ unsigned int mix(unsigned int x){x^=x>>16;x*=0x7feb352dU;x^=x>>15;x*=0x846ca68bU;return x^(x>>16);}
extern "C" __global__ void npc_risk(const double* input,double* output,int n){
 const int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
 const double drift=input[4*i],vol=input[4*i+1],risk=input[4*i+2];const unsigned int seed=(unsigned int)input[4*i+3];int positive=0;double loss=0;
 for(int p=0;p<64;p++){double path=0;for(int t=0;t<8;t++){const unsigned int k=seed+(p*8+t)*3U;const double z=2.0*(mix(k)/4294967296.0+mix(k+1U)/4294967296.0+mix(k+2U)/4294967296.0-1.5);path+=drift+vol*z;}positive+=path>0;loss+=path<0?-path:0;}
 output[2*i]=positive/64.0;double scale=1.0-loss/64.0*(10.0+20.0*(1.0-risk));output[2*i+1]=scale<.15?.15:scale>1?1:scale;
}
