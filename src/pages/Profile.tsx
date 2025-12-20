
import { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User, Upload, Moon, Sun, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { UserRole } from '@/types/interview';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['student', 'undergraduate', 'postgraduate']),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  phone: z.string().max(20).optional(),
  location: z.string().max(100).optional(),
  linkedin: z.string().url('Must be a valid URL').optional(),
  github: z.string().url('Must be a valid URL').optional(),
  portfolio: z.string().url('Must be a valid URL').optional(),
  skills: z.string().optional(), // comma-separated
});

type ProfileFormData = z.infer<typeof profileSchema>;

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      role: user?.role || 'student',
      description: user?.description || '',
      phone: user?.phone || '',
      location: user?.location || '',
      linkedin: user?.linkedin || '',
      github: user?.github || '',
      portfolio: user?.portfolio || '',
      skills: user?.skills || '',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name || '',
        role: user.role || 'student',
        description: user.description || '',
        phone: user.phone || '',
        location: user.location || '',
        linkedin: user.linkedin || '',
        github: user.github || '',
        portfolio: user.portfolio || '',
        skills: user.skills || '',
      });
    }
  }, [user, reset]);

  const watchedRole = watch('role');

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image smaller than 5MB.', variant: 'destructive' });
      return;
    }

    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profile-photos/${user.id}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      await updateProfile({ avatar: downloadURL });
      toast({ title: 'Photo uploaded', description: 'Your profile photo has been updated successfully.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Upload failed', description: 'Failed to upload photo.', variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;
    setIsLoading(true);
    try {
      await updateProfile({ ...data, role: data.role as UserRole });
      toast({ title: 'Profile updated', description: 'Your profile has been updated successfully.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Update failed', description: 'Failed to update profile.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return <Loader2 className="w-8 h-8 animate-spin text-primary" />;

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-20" />
      <div className="fixed top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-4">Profile Settings</h1>

          <Card className="glass-card border-border/50 mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Photo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('').toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                    {uploadingPhoto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                  <p className="text-sm text-muted-foreground">JPG, PNG or GIF. Max size 5MB.</p>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Name */}
                <div className="space-y-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" {...register('name')} placeholder="Enter your full name" />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <Label htmlFor="role">Role</Label>
                  <Select value={watchedRole} onValueChange={v => setValue('role', v as UserRole)}>
                    <SelectTrigger><SelectValue placeholder="Select your role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="undergraduate">Undergraduate</SelectItem>
                      <SelectItem value="postgraduate">Postgraduate</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label htmlFor="description">About</Label>
                  <Textarea id="description" {...register('description')} rows={4} placeholder="Tell us about yourself..." />
                  {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" {...register('phone')} placeholder="Optional" />
                  {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <Label htmlFor="location">Location / City</Label>
                  <Input id="location" {...register('location')} placeholder="Optional" />
                  {errors.location && <p className="text-sm text-destructive">{errors.location.message}</p>}
                </div>

                {/* LinkedIn */}
                <div className="space-y-1">
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input id="linkedin" {...register('linkedin')} placeholder="Optional - LinkedIn URL" />
                  {errors.linkedin && <p className="text-sm text-destructive">{errors.linkedin.message}</p>}
                </div>

                {/* GitHub */}
                <div className="space-y-1">
                  <Label htmlFor="github">GitHub</Label>
                  <Input id="github" {...register('github')} placeholder="Optional - GitHub URL" />
                  {errors.github && <p className="text-sm text-destructive">{errors.github.message}</p>}
                </div>

                {/* Portfolio */}
                <div className="space-y-1">
                  <Label htmlFor="portfolio">Portfolio</Label>
                  <Input id="portfolio" {...register('portfolio')} placeholder="Optional - Portfolio URL" />
                  {errors.portfolio && <p className="text-sm text-destructive">{errors.portfolio.message}</p>}
                </div>

                {/* Skills */}
                <div className="space-y-1">
                  <Label htmlFor="skills">Skills (comma-separated)</Label>
                  <Input id="skills" {...register('skills')} placeholder="e.g. JavaScript, React, Python" />
                  {errors.skills && <p className="text-sm text-destructive">{errors.skills.message}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Update Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Theme Toggle */}
      <Button
        onClick={toggleTheme}
        size="icon"
        variant="outline"
        className="fixed bottom-6 left-6 z-50 bg-background/80 backdrop-blur-sm border-border/50 hover:bg-background"
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </Button>
    </div>
  );
};

export default Profile;

